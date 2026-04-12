import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  OnModuleInit,
} from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookHandler, WebhookContext } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';
import { SubscriptionsService } from '../../../subscriptions/subscriptions.service';
import type { Json } from '../../../../../../packages/shared/types/database';

/**
 * Handles `invoice.payment_succeeded` webhook events.
 *
 * When an invoice payment succeeds:
 * - If this is a deferred proration invoice (in-place upgrade with SCA),
 *   finalize the BOS subscription / entitlement swap.
 * - Otherwise, the standard recovery path:
 *   - Skips if subscription is trialing (trial uses deferred billing)
 *   - Skips if already active (handled by payment_intent.succeeded)
 *   - Re-grants features if recovering from past_due
 *   - Updates subscription status to active
 */
@Injectable()
export class InvoicePaymentSucceededHandler
  implements WebhookHandler, OnModuleInit
{
  private readonly logger = new Logger(InvoicePaymentSucceededHandler.name);

  constructor(
    private readonly router: WebhookRouter,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  onModuleInit(): void {
    this.router.registerHandler('invoice.payment_succeeded', this);
  }

  async handle(ctx: WebhookContext): Promise<void> {
    const invoice = ctx.event.data.object as Stripe.Invoice;

    try {
      // Branch 1: deferred proration invoice from an in-place upgrade.
      const bosSessionId = invoice.metadata?.bosCheckoutSessionId;
      const isProrationInvoice =
        invoice.metadata?.bosProrationInvoice === 'true';
      if (bosSessionId && isProrationInvoice) {
        await this.finalizePendingUpgrade(ctx, invoice, bosSessionId);
        return;
      }

      const invoiceData = invoice as any;
      if (!invoiceData.subscription) return;

      this.logger.log(
        `Invoice payment succeeded: ${invoice.id} for subscription ${invoiceData.subscription}`,
      );

      const supabase = ctx.supabase;

      // Check current subscription status before overriding
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('stripe_subscription_id', invoiceData.subscription)
        .single();

      if (!existing) {
        this.logger.warn(
          `Subscription ${invoiceData.subscription} not found in DB for invoice payment`,
        );
        return;
      }

      // Don't override trialing status -- trial subscriptions use deferred billing
      if (existing.status === 'trialing') {
        this.logger.log(
          `Subscription ${invoiceData.subscription} is trialing -- not overriding to active`,
        );
        return;
      }

      // Don't override if already active (handled by payment_intent.succeeded)
      if (existing.status === 'active') {
        this.logger.log(
          `Subscription ${invoiceData.subscription} already active -- no update needed`,
        );
        return;
      }

      // Re-grant features if recovering from past_due (features were revoked on failure)
      if (existing.status === 'past_due') {
        const { data: fullSub } = await supabase
          .from('subscriptions')
          .select(
            'id, customer_id, product_id, current_period_start, current_period_end',
          )
          .eq('stripe_subscription_id', invoiceData.subscription)
          .single();

        if (fullSub) {
          await this.subscriptionsService.grantProductFeatures(
            fullSub.customer_id,
            fullSub.id,
            fullSub.product_id,
            new Date(fullSub.current_period_start),
            new Date(fullSub.current_period_end),
          );
          this.logger.log(
            `Re-granted features for subscription ${invoiceData.subscription} after payment recovery`,
          );
        }
      }

      // Update to active for other statuses (past_due, incomplete, etc.)
      await supabase
        .from('subscriptions')
        .update({ status: 'active' })
        .eq('stripe_subscription_id', invoiceData.subscription);

      this.logger.log(
        `Subscription ${invoiceData.subscription} marked as active`,
      );
    } catch (error) {
      this.logger.error('Error handling invoice.payment_succeeded:', error);
    }
  }

  /**
   * Finalize a deferred in-place upgrade once Stripe confirms the proration
   * invoice has been paid (the customer completed SCA / 3DS, or the saved card
   * eventually charged).
   *
   * Mirrors `BosPlanExecutor.handleSubscriptionUpdated` but runs out-of-band
   * from the synchronous executor.
   */
  private async finalizePendingUpgrade(
    ctx: WebhookContext,
    invoice: Stripe.Invoice,
    bosSessionId: string,
  ): Promise<void> {
    const supabase = ctx.supabase;

    const { data: session, error: sessionError } = await supabase
      .from('checkout_sessions')
      .select('id, status, metadata')
      .eq('id', bosSessionId)
      .single();

    if (sessionError || !session) {
      this.logger.warn(
        `Proration invoice ${invoice.id}: checkout session ${bosSessionId} not found`,
      );
      return;
    }

    // Idempotency: already finalized.
    if (session.status === 'completed') {
      this.logger.log(
        `Proration invoice ${invoice.id}: session ${bosSessionId} already completed`,
      );
      return;
    }

    if (session.status !== 'requires_action') {
      this.logger.warn(
        `Proration invoice ${invoice.id}: session ${bosSessionId} is in unexpected status ${session.status}`,
      );
      return;
    }

    const metadata = (session.metadata as Record<string, unknown>) || {};
    const existingSubscriptionId = metadata.existingSubscriptionId as
      | string
      | undefined;
    const newProductId = metadata.productId as string | undefined;
    const newPriceId = metadata.priceId as string | undefined;
    const newAmount = metadata.newAmount as number | undefined;

    if (!existingSubscriptionId || !newProductId || !newPriceId) {
      this.logger.error(
        `Proration invoice ${invoice.id}: session ${bosSessionId} metadata is missing upgrade fields`,
      );
      await supabase
        .from('checkout_sessions')
        .update({
          status: 'failed',
          execution_error:
            'Upgrade metadata missing on requires_action session',
          updated_at: new Date().toISOString(),
        })
        .eq('id', bosSessionId);
      return;
    }

    // Snapshot the previous product so we can record it on metadata.
    const { data: oldSub } = await supabase
      .from('subscriptions')
      .select('id, product_id, metadata')
      .eq('id', existingSubscriptionId)
      .single();

    const previousProductId = oldSub?.product_id ?? null;

    // Swap BOS subscription columns to the new product/price.
    const now = new Date().toISOString();
    const { error: subUpdateError } = await supabase
      .from('subscriptions')
      .update({
        product_id: newProductId,
        price_id: newPriceId,
        ...(typeof newAmount === 'number' ? { amount: newAmount } : {}),
        status: 'active',
        updated_at: now,
        metadata: {
          ...((oldSub?.metadata as Record<string, unknown>) || {}),
          upgradedAt: now,
          previousProductId,
          upgradeMethod: 'in_place',
          upgradeFinalizedVia: 'invoice.payment_succeeded',
        } as Json,
      })
      .eq('id', existingSubscriptionId);

    if (subUpdateError) {
      this.logger.error(
        `Proration invoice ${invoice.id}: failed to update BOS sub ${existingSubscriptionId}`,
        subUpdateError,
      );
      throw subUpdateError;
    }

    // Swap entitlements via the unified entitlement service.
    try {
      await this.subscriptionsService.swapProductEntitlementsForUpgrade(
        existingSubscriptionId,
        newProductId,
      );
    } catch (entError) {
      this.logger.error(
        `Proration invoice ${invoice.id}: failed to swap entitlements for sub ${existingSubscriptionId}`,
        entError,
      );
      throw entError;
    }

    // Cancel any pending scheduled downgrades on this subscription.
    await supabase
      .from('subscription_changes')
      .update({
        status: 'failed',
        failed_reason: 'Superseded by upgrade',
        updated_at: now,
      })
      .eq('subscription_id', existingSubscriptionId)
      .eq('status', 'scheduled');

    // Flip the checkout session to completed.
    const { error: sessionUpdateError } = await supabase
      .from('checkout_sessions')
      .update({
        status: 'completed',
        completed_at: now,
        executed_at: now,
        updated_at: now,
        ...(invoice.id ? { stripe_invoice_id: invoice.id } : {}),
      })
      .eq('id', bosSessionId);

    if (sessionUpdateError) {
      this.logger.error(
        `Proration invoice ${invoice.id}: failed to flip session ${bosSessionId} to completed`,
        sessionUpdateError,
      );
      throw sessionUpdateError;
    }

    this.logger.log(
      `Finalized deferred upgrade: session=${bosSessionId} sub=${existingSubscriptionId} → product=${newProductId}`,
    );
  }
}
