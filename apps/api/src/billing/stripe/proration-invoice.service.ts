import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import { StripeService } from '../../stripe/stripe.service';

/**
 * Result of running an in-place upgrade through the proration-invoice flow.
 *
 * - `no_proration` — the subscription update did not yield any pending invoice
 *   items (e.g. price unchanged or fully credited). The caller can proceed to
 *   write BOS state synchronously.
 * - `paid` — the proration invoice was created, finalized, and either paid
 *   immediately (zero-amount) or paid via the customer's saved card. The
 *   caller can write BOS state synchronously.
 * - `action_required` — Stripe returned an `open` invoice with a hosted URL
 *   the customer must visit (SCA / 3DS / similar). The caller must NOT mutate
 *   the BOS subscription / entitlements; the success webhook will finalize.
 */
export type ProrationInvoiceResult =
  | { kind: 'no_proration'; updatedSub: Stripe.Subscription }
  | { kind: 'paid'; updatedSub: Stripe.Subscription; invoice: Stripe.Invoice }
  | {
      kind: 'action_required';
      updatedSub: Stripe.Subscription;
      invoice: Stripe.Invoice;
      hostedInvoiceUrl: string;
    };

export interface RunUpgradeParams {
  stripeAccountId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  newStripePriceId: string;
  /** BOS checkout session ID — used as Stripe idempotency key */
  checkoutSessionId: string;
  /** BOS subscription ID — recorded on invoice metadata for webhook lookup */
  bosSubscriptionId?: string;
  /** True when the billing interval changes (e.g. monthly→yearly) — requires billing_cycle_anchor: 'now' */
  intervalChanged?: boolean;
}

/**
 * Orchestrates the multi-step Stripe flow for an in-place upgrade.
 *
 * Stripe's `subscriptions.update({ proration_behavior: 'always_invoice' })`
 * looks like a one-call solution but has two failure modes we cannot tolerate:
 *
 *   1. If the saved card declines, Stripe still applies the item swap and
 *      leaves the customer on the new plan in `past_due`. The embed thinks
 *      the upgrade succeeded.
 *   2. If the proration invoice needs SCA, Stripe leaves it `open` and
 *      never surfaces the `hosted_invoice_url` synchronously.
 *
 * This service walks the steps manually so we can classify the result and
 * either roll back the item swap (decline) or hand the customer a hosted URL
 * (SCA). Modeled after Autumn V1's upgrade orchestration.
 */
@Injectable()
export class ProrationInvoiceService {
  private readonly logger = new Logger(ProrationInvoiceService.name);

  constructor(private readonly stripeService: StripeService) {}

  async runUpgrade(params: RunUpgradeParams): Promise<ProrationInvoiceResult> {
    const {
      stripeAccountId,
      stripeCustomerId,
      stripeSubscriptionId,
      newStripePriceId,
      checkoutSessionId,
      bosSubscriptionId,
    } = params;

    // 1. Snapshot the current subscription so we can roll back items if the
    //    payment ultimately fails.
    const curSub = await this.stripeService.getSubscription(
      stripeSubscriptionId,
      stripeAccountId,
    );

    if (!curSub.items?.data?.[0]) {
      throw new BadRequestException('Subscription has no items');
    }
    const subscriptionItemId = curSub.items.data[0].id;

    // 1b. Extract payment method for the proration invoice. The invoice is
    //     created standalone (not linked to the subscription), so Stripe won't
    //     fall back to the subscription's default_payment_method automatically.
    let paymentMethodId = this.extractPaymentMethodId(
      curSub.default_payment_method,
    );
    if (!paymentMethodId) {
      // Fallback: check the customer's invoice_settings.default_payment_method
      try {
        const customer = await this.stripeService.getConnectCustomer(
          stripeCustomerId,
          stripeAccountId,
        );
        if (customer && !customer.deleted) {
          paymentMethodId = this.extractPaymentMethodId(
            customer.invoice_settings?.default_payment_method ?? null,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to fetch customer ${stripeCustomerId} for payment method fallback: ${this.errMsg(err)}`,
        );
      }
    }
    if (!paymentMethodId) {
      this.logger.warn(
        `No default_payment_method found on subscription ${stripeSubscriptionId} or customer ${stripeCustomerId}; invoices.pay() may fail`,
      );
    }

    // 2. Apply the item swap with `create_prorations`. This pushes the proration
    //    line items into the customer's pending pool but does NOT create or pay
    //    an invoice. `error_if_incomplete` ensures Stripe doesn't silently flip
    //    the sub to `incomplete` if anything goes wrong.
    let updatedSub: Stripe.Subscription;
    try {
      updatedSub = await this.stripeService.updateSubscriptionWithParams(
        stripeSubscriptionId,
        {
          items: [{ id: subscriptionItemId, price: newStripePriceId }],
          proration_behavior: 'create_prorations',
          payment_behavior: 'error_if_incomplete',
          billing_cycle_anchor: params.intervalChanged ? 'now' : 'unchanged',
          expand: ['latest_invoice'],
        },
        stripeAccountId,
      );
    } catch (error) {
      this.logger.error(
        `subscriptions.update failed for ${stripeSubscriptionId}: ${this.errMsg(error)}`,
      );
      // Stripe rejected the update outright — nothing to roll back.
      throw new BadRequestException(
        `Failed to update subscription: ${this.errMsg(error)}`,
      );
    }

    // 3. Idempotency recovery: if a previous run created a draft proration
    //    invoice but crashed before finalizing it, find that invoice and pick
    //    up where we left off instead of creating a duplicate.
    let invoice: Stripe.Invoice | null =
      await this.stripeService.searchDraftInvoiceBySession(
        stripeCustomerId,
        checkoutSessionId,
        stripeAccountId,
      );

    if (!invoice) {
      // 4. Verify there are pending items to invoice. If a previous run already
      //    pulled them in (or this is a no-op price change), short-circuit.
      const pendingItems = await this.stripeService.listPendingInvoiceItems(
        stripeCustomerId,
        stripeAccountId,
      );
      if (pendingItems.length === 0) {
        return { kind: 'no_proration', updatedSub };
      }

      // 5. Create the invoice manually so we control auto_advance and metadata.
      try {
        invoice = await this.stripeService.createInvoice(
          {
            customer: stripeCustomerId,
            auto_advance: false,
            collection_method: 'charge_automatically',
            pending_invoice_items_behavior: 'include',
            description: 'Subscription plan change proration',
            metadata: {
              bosCheckoutSessionId: checkoutSessionId,
              bosProrationInvoice: 'true',
              ...(bosSubscriptionId ? { bosSubscriptionId } : {}),
            },
          },
          stripeAccountId,
          `proration-inv:${checkoutSessionId}`,
        );
      } catch (error) {
        this.logger.error(
          `invoices.create failed for session ${checkoutSessionId}: ${this.errMsg(error)}`,
        );
        // No invoice exists — nothing to clean up. The pending items remain on
        // the customer; a retry will pick them up.
        await this.undoSubUpdate(curSub, updatedSub, stripeAccountId, params.intervalChanged);
        throw new BadRequestException(
          `Failed to create proration invoice: ${this.errMsg(error)}`,
        );
      }
    }

    // 6. Finalize. If the invoice is already finalized (idempotent recovery),
    //    Stripe is a no-op.
    let finalized: Stripe.Invoice;
    try {
      finalized = await this.stripeService.finalizeInvoice(
        invoice.id,
        stripeAccountId,
        { auto_advance: false },
      );
    } catch (error) {
      this.logger.error(
        `invoices.finalizeInvoice failed for ${invoice.id}: ${this.errMsg(error)}`,
      );
      // Try to clean up the draft invoice and revert the sub.
      try {
        await this.stripeService.voidInvoice(invoice.id, stripeAccountId);
      } catch (voidErr) {
        this.logger.warn(
          `Failed to void draft invoice ${invoice.id}: ${this.errMsg(voidErr)}`,
        );
      }
      await this.undoSubUpdate(curSub, updatedSub, stripeAccountId, params.intervalChanged);
      throw new BadRequestException(
        `Failed to finalize proration invoice: ${this.errMsg(error)}`,
      );
    }

    // 7. If finalize already paid the invoice (zero-amount or negative), happy path.
    if (finalized.status === 'paid') {
      // If the invoice total is negative, the customer has remaining credit.
      // Stripe doesn't auto-credit the balance for standalone invoices —
      // explicitly create a balance transaction so the credit applies to
      // future invoices.
      if (finalized.total < 0) {
        try {
          await this.stripeService.createCustomerBalanceTransaction(
            stripeCustomerId,
            finalized.total, // negative = credit
            finalized.currency,
            stripeAccountId,
            'Remaining proration credit from plan upgrade',
          );
          this.logger.log(
            `Credited customer ${stripeCustomerId} balance by ${finalized.total} ${finalized.currency} from proration invoice ${finalized.id}`,
          );
        } catch (err) {
          // Non-fatal: the upgrade succeeded, but credit wasn't applied.
          // Log for ops to reconcile manually.
          this.logger.error(
            `Failed to credit customer balance after negative proration invoice ${finalized.id}: ${this.errMsg(err)}`,
          );
        }
      }
      return { kind: 'paid', updatedSub, invoice: finalized };
    }

    // 8. Pay it. This is where SCA / declines manifest.
    try {
      const paid = await this.stripeService.payInvoice(
        finalized.id,
        stripeAccountId,
        paymentMethodId ? { payment_method: paymentMethodId } : undefined,
      );
      if (paid.status === 'paid') {
        if (paid.total < 0) {
          try {
            await this.stripeService.createCustomerBalanceTransaction(
              stripeCustomerId,
              paid.total,
              paid.currency,
              stripeAccountId,
              'Remaining proration credit from plan upgrade',
            );
            this.logger.log(
              `Credited customer ${stripeCustomerId} balance by ${paid.total} ${paid.currency} from proration invoice ${paid.id}`,
            );
          } catch (err) {
            this.logger.error(
              `Failed to credit customer balance after negative proration invoice ${paid.id}: ${this.errMsg(err)}`,
            );
          }
        }
        return { kind: 'paid', updatedSub, invoice: paid };
      }
      // Pay returned without throwing but didn't reach `paid` (e.g. open/draft).
      // Fall through to the action-required / rollback classification.
      return this.classifyUnpaidInvoice(
        paid,
        curSub,
        updatedSub,
        stripeAccountId,
        params.intervalChanged,
      );
    } catch (error) {
      this.logger.warn(
        `invoices.pay failed for ${finalized.id}: ${this.errMsg(error)}`,
      );
      // Re-fetch — Stripe may have transitioned the invoice into an open state
      // with a hosted URL (SCA case) even though pay() threw.
      const refetched = await this.stripeService.retrieveInvoice(
        finalized.id,
        stripeAccountId,
      );
      return this.classifyUnpaidInvoice(
        refetched,
        curSub,
        updatedSub,
        stripeAccountId,
        params.intervalChanged,
      );
    }
  }

  /**
   * Decide whether an unpaid invoice represents an SCA hand-off (return
   * `action_required` so the SDK can show the hosted URL) or a hard failure
   * (void the invoice, revert the sub, throw).
   */
  private async classifyUnpaidInvoice(
    invoice: Stripe.Invoice,
    curSub: Stripe.Subscription,
    updatedSub: Stripe.Subscription,
    stripeAccountId: string,
    intervalChanged?: boolean,
  ): Promise<ProrationInvoiceResult> {
    if (invoice.status === 'paid') {
      return { kind: 'paid', updatedSub, invoice };
    }

    if (invoice.status === 'open' && invoice.hosted_invoice_url) {
      this.logger.log(
        `Invoice ${invoice.id} is open and requires customer action`,
      );
      return {
        kind: 'action_required',
        updatedSub,
        invoice,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
      };
    }

    // Hard failure: void the invoice and revert the sub.
    this.logger.error(
      `Invoice ${invoice.id} is in unrecoverable state ${invoice.status}; rolling back`,
    );
    try {
      if (invoice.status !== 'void') {
        await this.stripeService.voidInvoice(invoice.id, stripeAccountId);
      }
    } catch (voidErr) {
      this.logger.warn(
        `Failed to void invoice ${invoice.id}: ${this.errMsg(voidErr)}`,
      );
    }
    await this.undoSubUpdate(curSub, updatedSub, stripeAccountId, intervalChanged);
    throw new BadRequestException(
      'Proration invoice could not be paid; subscription reverted to previous plan.',
    );
  }

  /**
   * Revert a subscription's items back to the pre-update snapshot. Uses
   * `proration_behavior: 'none'` so we do NOT create another set of proration
   * line items on top of the rollback.
   *
   * BOS subscriptions are single-item, so this collapses to a one-entry update.
   * The diff logic handles the general case in case we ever support multi-item.
   */
  private async undoSubUpdate(
    curSub: Stripe.Subscription,
    updatedSub: Stripe.Subscription,
    stripeAccountId: string,
    intervalChanged?: boolean,
  ): Promise<void> {
    type ItemParam = Stripe.SubscriptionUpdateParams.Item;

    // Items present on the updated sub: restore old price/quantity if the item
    // existed before, otherwise mark for deletion.
    const itemsToUpdate: ItemParam[] = updatedSub.items.data.map((u) => {
      const old = curSub.items.data.find((c) => c.id === u.id);
      if (old) {
        return {
          id: u.id,
          price: old.price.id,
          quantity: old.quantity ?? 1,
        };
      }
      return { id: u.id, deleted: true } as ItemParam;
    });

    // Items that existed before but were removed in the update: re-add them.
    const itemsToAdd: ItemParam[] = curSub.items.data
      .filter((c) => !updatedSub.items.data.some((u) => u.id === c.id))
      .map((c) => ({
        price: c.price.id,
        quantity: c.quantity ?? 1,
      }));

    try {
      await this.stripeService.updateSubscriptionWithParams(
        curSub.id,
        {
          items: [...itemsToUpdate, ...itemsToAdd],
          proration_behavior: 'none',
          billing_cycle_anchor: intervalChanged ? 'now' : 'unchanged',
        },
        stripeAccountId,
      );
      this.logger.log(
        `Reverted subscription ${curSub.id} to pre-upgrade state`,
      );
    } catch (error) {
      // CRITICAL: rollback failed. Stripe is now on the new plan, the invoice
      // is voided, and BOS is unchanged. Manual ops intervention required.
      this.logger.error(
        `CRITICAL: Failed to revert subscription ${curSub.id}: ${this.errMsg(error)}`,
      );
      // Don't swallow — the caller will mark the session failed, but ops needs
      // to know the Stripe state is inconsistent.
      throw new BadRequestException(
        'Upgrade rollback failed; subscription is in an inconsistent state.',
      );
    }
  }

  private extractPaymentMethodId(
    pm: string | Stripe.PaymentMethod | null | undefined,
  ): string | null {
    if (!pm) return null;
    return typeof pm === 'string' ? pm : pm.id;
  }

  private errMsg(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
