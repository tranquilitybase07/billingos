import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  OnModuleInit,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import Stripe from 'stripe';
import { WebhookHandler, WebhookContext } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';
import { StripeService } from '../../../stripe/stripe.service';
import { SubscriptionsService } from '../../../subscriptions/subscriptions.service';
import { SubscriptionTransitionService } from '../../../subscriptions/subscription-transition.service';
import { EntitlementService } from '../../entitlements/entitlement.service';
import {
  extractPeriodStart,
  extractPeriodEnd,
} from '../../utils/period-end.helper';
import type { Database } from '../../../../../../packages/shared/types/database';

type PaymentIntentRow = Database['public']['Tables']['payment_intents']['Row'];
type CheckoutSessionRow =
  Database['public']['Tables']['checkout_sessions']['Row'];
type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];
type SubscriptionUpdate =
  Database['public']['Tables']['subscriptions']['Update'];

/**
 * Handles `payment_intent.succeeded` webhook events.
 *
 * Standard / adaptive / embedded paths all run on Stripe Checkout Session
 * — Stripe creates the subscription + invoice + PaymentIntent atomically.
 * `checkout.session.completed` is the primary handler. This handler is the
 * safety-net path when the PI webhook fires before / instead of the
 * checkout-session webhook: it resolves the subscription from the
 * PaymentIntent's metadata or the linked invoice and finishes the BOS sync.
 */
@Injectable()
export class PaymentIntentSucceededHandler
  implements WebhookHandler, OnModuleInit
{
  private readonly logger = new Logger(PaymentIntentSucceededHandler.name);

  constructor(
    private readonly router: WebhookRouter,
    private readonly stripeService: StripeService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    @Inject(forwardRef(() => SubscriptionTransitionService))
    private readonly transitionService: SubscriptionTransitionService,
    private readonly entitlementService: EntitlementService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  onModuleInit(): void {
    this.router.registerHandler('payment_intent.succeeded', this);
  }

  async handle(ctx: WebhookContext): Promise<void> {
    const paymentIntent = ctx.event.data.object as Stripe.PaymentIntent;

    try {
      this.logger.log(`Payment intent succeeded: ${paymentIntent.id}`);

      const supabase = ctx.supabase;

      // Update payment intent status in database
      const { data: paymentIntentRecord, error: updateError } = await supabase
        .from('payment_intents')
        .update({
          status: paymentIntent.status,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', paymentIntent.id)
        .select()
        .single();

      if (updateError || !paymentIntentRecord) {
        this.logger.log(
          `Payment intent ${paymentIntent.id} not in BOS payment_intents — handled elsewhere or external. Skipping.`,
        );
        return;
      }

      // Mark checkout session as completed and fetch metadata
      const { data: checkoutSession } = await supabase
        .from('checkout_sessions')
        .update({
          completed_at: new Date().toISOString(),
        })
        .eq('payment_intent_id', paymentIntentRecord.id)
        .select()
        .single();

      const metadata = paymentIntent.metadata || {};
      const checkoutMetadata = (checkoutSession?.metadata ?? {}) as Record<
        string,
        unknown
      >;

      const organizationId =
        metadata.organizationId || paymentIntentRecord.organization_id;
      const productId = metadata.productId || paymentIntentRecord.product_id;
      const priceId = metadata.priceId || paymentIntentRecord.price_id;

      if (!organizationId || !productId || !priceId) {
        this.logger.error(
          'Missing required IDs (neither Stripe metadata nor BOS row supplied them):',
          { metadata, paymentIntentRecordId: paymentIntentRecord.id },
        );
        return;
      }

      // Determine if this is the new direct-subscription flow
      const piMetadata = (paymentIntentRecord.metadata ?? {}) as Record<
        string,
        unknown
      >;
      const stripeSubscriptionId =
        paymentIntentRecord.stripe_subscription_id ||
        (checkoutMetadata.stripeSubscriptionId as string | undefined) ||
        (piMetadata.stripeSubscriptionId as string | undefined);

      const isDirectSubscriptionFlow =
        !!stripeSubscriptionId ||
        !!piMetadata.subscriptionCreatedDuringCheckout;

      if (isDirectSubscriptionFlow && stripeSubscriptionId) {
        await this.handleDirectSubscriptionPaymentSuccess(
          ctx,
          paymentIntent,
          paymentIntentRecord,
          checkoutSession,
          stripeSubscriptionId,
        );
      } else {
        // Check if this PaymentIntent actually belongs to an existing
        // Stripe subscription (webhook arrived before our DB commit).
        // Expand the invoice to find the subscription.
        let resolvedStripeSubId: string | null = null;
        try {
          const piInvoice = (paymentIntent as any).invoice;
          if (piInvoice) {
            const invoiceId =
              typeof piInvoice === 'string' ? piInvoice : piInvoice?.id;
            if (invoiceId) {
              const inv = await this.stripeService.retrieveInvoice(
                invoiceId,
                paymentIntentRecord.stripe_account_id || undefined,
              );
              const invSubscription = (inv as any).subscription;
              if (invSubscription) {
                resolvedStripeSubId =
                  typeof invSubscription === 'string'
                    ? invSubscription
                    : invSubscription.id;
              }
            }
          }
        } catch (resolveError) {
          this.logger.warn(
            'Could not resolve invoice subscription for race check:',
            resolveError,
          );
        }

        if (resolvedStripeSubId) {
          this.logger.log(
            `Resolved subscription ${resolvedStripeSubId} from invoice for PI ${paymentIntent.id}`,
          );
          await this.handleDirectSubscriptionPaymentSuccess(
            ctx,
            paymentIntent,
            paymentIntentRecord,
            checkoutSession,
            resolvedStripeSubId,
          );
        } else {
          // No subscription linked anywhere — the checkout-session.completed
          // handler is the authoritative path, so just no-op here.
          this.logger.log(
            `PI ${paymentIntent.id} succeeded with no resolvable subscription — handled by checkout.session.completed.`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Critical error in payment_intent.succeeded handler:',
        error,
      );
      this.logger.error('Stack trace:', (error as Error)?.stack);
    }
  }

  // ---------------------------------------------------------------------------
  // Private sub-handlers
  // ---------------------------------------------------------------------------

  /**
   * New flow: subscription already exists (created during checkout).
   * Update status to active, handle upgrade/downgrade, grant features.
   */
  private async handleDirectSubscriptionPaymentSuccess(
    ctx: WebhookContext,
    paymentIntent: Stripe.PaymentIntent,
    paymentIntentRecord: PaymentIntentRow,
    checkoutSession: CheckoutSessionRow | null,
    stripeSubscriptionId: string,
  ): Promise<void> {
    const supabase = ctx.supabase;
    const metadata = paymentIntent.metadata || {};
    const checkoutMetadata =
      (checkoutSession?.metadata as Record<string, unknown> | null) || null;

    const organizationId =
      metadata.organizationId || paymentIntentRecord.organization_id;
    const productId =
      metadata.productId || paymentIntentRecord.product_id || undefined;
    const priceId =
      metadata.priceId || paymentIntentRecord.price_id || undefined;
    const customerId =
      metadata.customerId || (paymentIntentRecord.customer_id ?? undefined);

    this.logger.log(
      `Direct subscription flow: updating subscription ${stripeSubscriptionId} to active`,
    );

    // Get the Stripe account ID
    const stripeAccountId =
      paymentIntentRecord.stripe_account_id ||
      (checkoutMetadata?.stripeAccountId as string | undefined);

    if (!customerId || !organizationId || !productId || !priceId) {
      this.logger.error(
        `Missing required identifiers for PI ${paymentIntent.id} ` +
          `(customerId=${customerId}, organizationId=${organizationId}, ` +
          `productId=${productId}, priceId=${priceId}) — aborting`,
      );
      return;
    }
    if (!stripeAccountId) {
      this.logger.error(
        `Missing stripeAccountId for PI ${paymentIntent.id} — aborting`,
      );
      return;
    }

    // Fetch the updated subscription from Stripe to get current status and period data
    let stripeSubscription: Stripe.Subscription | null = null;
    try {
      stripeSubscription = await this.stripeService.getSubscription(
        stripeSubscriptionId,
        stripeAccountId,
      );
    } catch (e) {
      this.logger.warn(
        `Could not fetch subscription ${stripeSubscriptionId} from Stripe:`,
        e,
      );
    }

    // Find existing subscription record in our DB
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .single();

    // Build update data from Stripe subscription (or use defaults)
    const newStatus = stripeSubscription?.status || 'active';
    const updateData: SubscriptionUpdate = {
      status: newStatus,
      payment_intent_id: paymentIntentRecord.id,
      updated_at: new Date().toISOString(),
    };

    if (stripeSubscription) {
      updateData.current_period_start = extractPeriodStart(stripeSubscription);
      updateData.current_period_end = extractPeriodEnd(stripeSubscription);
    }

    // Apply discount info from checkout metadata
    if (checkoutMetadata?.appliedDiscountId) {
      updateData.discount_id = checkoutMetadata.appliedDiscountId as string;
      updateData.discount_amount = checkoutMetadata.discountAmount
        ? parseInt(String(checkoutMetadata.discountAmount), 10)
        : null;
      updateData.discount_code =
        (checkoutMetadata.appliedDiscountCode as string | null) || null;
    }

    // Update metadata
    const existingMeta =
      (existingSubscription?.metadata as Record<string, unknown> | null) || {};
    updateData.metadata = {
      ...existingMeta,
      payment_intent_id: paymentIntentRecord.id,
      activated_from: 'direct_subscription_payment_succeeded',
    };

    // -- HANDLE UPGRADE/DOWNGRADE BEFORE creating/updating subscription --
    const stripeSubMeta = (stripeSubscription?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const existingSubId =
      (checkoutMetadata?.existingSubscriptionId as string | undefined) ||
      (stripeSubMeta.existingSubscriptionId as string | undefined) ||
      null;

    if (existingSubId) {
      const newAmount = paymentIntentRecord.amount || 0;
      await this.transitionService.handleTransition(
        existingSubId,
        stripeAccountId,
        newAmount,
        checkoutSession?.id,
      );
    }

    // -- NOW create/update subscription in DB --
    let subscription: SubscriptionRow | null = null;

    if (existingSubscription) {
      // Update existing subscription record
      const { data, error } = await supabase
        .from('subscriptions')
        .update(updateData)
        .eq('id', existingSubscription.id)
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to update subscription:', error);
        return;
      }
      subscription = data;
      this.logger.log(
        `Subscription ${existingSubscription.id} updated to ${newStatus}`,
      );
    } else {
      // Edge case: subscription not in DB (DB write failed during checkout).
      // Create it now from Stripe data.
      this.logger.warn(
        `Subscription ${stripeSubscriptionId} not found in DB -- creating from Stripe data`,
      );

      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          customer_id: customerId,
          organization_id: organizationId,
          product_id: productId,
          price_id: priceId,
          stripe_subscription_id: stripeSubscriptionId,
          status: newStatus,
          current_period_start:
            updateData.current_period_start || new Date().toISOString(),
          current_period_end:
            updateData.current_period_end ||
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          cancel_at_period_end: false,
          amount: paymentIntentRecord.amount || 0,
          currency: paymentIntentRecord.currency || 'usd',
          payment_intent_id: paymentIntentRecord.id,
          discount_id: updateData.discount_id || null,
          discount_amount: updateData.discount_amount || null,
          discount_code: updateData.discount_code || null,
          metadata: {
            payment_intent_id: paymentIntentRecord.id,
            created_from: 'direct_subscription_payment_succeeded_fallback',
          },
        })
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to create subscription in DB:', error);
        return;
      }
      subscription = data;
    }

    if (!subscription) {
      this.logger.error(
        `No subscription resolved for PI ${paymentIntent.id} — aborting grant/update`,
      );
      return;
    }

    // Invalidate product revenue metrics cache
    const cacheKey = `product-metrics:${productId}`;
    await this.cacheManager.del(cacheKey);

    // Grant features
    await this.entitlementService.ensureGrantsForSubscription(
      customerId,
      subscription.id,
      productId,
    );

    // Update checkout session with subscription info
    await supabase
      .from('checkout_sessions')
      .update({
        subscription_id: subscription.id,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_intent_id', paymentIntentRecord.id);

    // Best-effort: populate customer country from card
    const directPmRaw = paymentIntent.payment_method;
    const directPmId =
      typeof directPmRaw === 'string' ? directPmRaw : directPmRaw?.id;
    this.logger.log(
      `[CardCountry] direct-sub path -- customerId=${customerId}, ` +
        `payment_method=${JSON.stringify(directPmRaw)}, pmId=${directPmId}, ` +
        `stripeAccountId=${stripeAccountId}`,
    );
    await this.tryUpdateCustomerCardCountry(
      ctx,
      customerId,
      directPmId,
      stripeAccountId,
    );

    this.logger.log(
      `Successfully completed direct-subscription flow for PI ${paymentIntent.id}`,
    );
  }

  /**
   * Best-effort: populate customer billing_address.country from the card's issuing country.
   * Non-critical -- must never fail the parent flow.
   */
  private async tryUpdateCustomerCardCountry(
    ctx: WebhookContext,
    customerId: string,
    paymentMethodId: string | null | undefined,
    stripeAccountId: string | null | undefined,
  ): Promise<void> {
    if (!paymentMethodId || !stripeAccountId) {
      this.logger.log(
        `[CardCountry] skipping -- paymentMethodId=${paymentMethodId}, stripeAccountId=${stripeAccountId}`,
      );
      return;
    }

    try {
      const supabase = ctx.supabase;

      // Check if customer already has a country set
      const { data: customer } = await supabase
        .from('customers')
        .select('id, billing_address')
        .eq('id', customerId)
        .single();

      if (!customer) return;

      const existingAddress =
        (customer.billing_address as Record<string, unknown>) || {};
      if (existingAddress.country) return; // Already set, don't overwrite

      // Retrieve payment method from Stripe to get card country
      const paymentMethod = await this.stripeService.getPaymentMethod(
        paymentMethodId,
        stripeAccountId,
      );

      const cardCountry = paymentMethod.card?.country;
      this.logger.log(
        `[CardCountry] retrieved PM ${paymentMethodId} -- type=${paymentMethod.type}, ` +
          `card.country=${cardCountry}, card.brand=${paymentMethod.card?.brand}`,
      );
      if (!cardCountry) return;

      // Merge country into existing billing_address
      await supabase
        .from('customers')
        .update({
          billing_address: { ...existingAddress, country: cardCountry },
        })
        .eq('id', customerId);

      this.logger.log(
        `Updated customer ${customerId} billing country to ${cardCountry}`,
      );
    } catch (error) {
      this.logger.warn(
        `Non-critical: failed to update card country for customer ${customerId}:`,
        error,
      );
    }
  }
}
