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

/**
 * Handles `checkout.session.completed` webhook events.
 *
 * This is the unified handler for checkout session completion, absorbing the
 * logic previously in adaptive-pricing-webhook.service.ts. Stripe creates the
 * subscription during checkout -- this handler syncs it to our DB.
 *
 * Flow:
 * 1. Validate BillingOS metadata (organizationId, productId, priceId)
 * 2. Guard against duplicate processing (completed_at check)
 * 3. Resolve Stripe subscription and customer
 * 4. Handle upgrade/downgrade transitions
 * 5. Dedup against existing DB subscriptions
 * 6. Create or update subscription record
 * 7. Invalidate revenue cache, grant features, update checkout session
 * 8. Best-effort: populate customer card country
 */
@Injectable()
export class CheckoutSessionCompletedHandler
  implements WebhookHandler, OnModuleInit
{
  private readonly logger = new Logger(CheckoutSessionCompletedHandler.name);

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
    this.router.registerHandler('checkout.session.completed', this);
  }

  async handle(ctx: WebhookContext): Promise<void> {
    const session = ctx.event.data.object as Stripe.Checkout.Session;

    try {
      this.logger.log(`Checkout session completed: ${session.id}`);

      // Handles BillingOS-issued Checkout Sessions (standard hosted, adaptive).
      const metadata = (session.metadata || {}) as Record<string, string>;
      const metadataId = metadata.metadataId;
      const organizationId = metadata.organizationId;
      const productId = metadata.productId;
      const priceId = metadata.priceId;

      if (!organizationId || !productId || !priceId) {
        this.logger.log(
          `Checkout session ${session.id} missing BillingOS metadata -- skipping`,
        );
        return;
      }

      const supabase = ctx.supabase;

      // Find our checkout_sessions record by Stripe session ID (stored in metadata)
      const { data: checkoutSession } = await supabase
        .from('checkout_sessions')
        .select('id, subscription_id, completed_at, organization_id, metadata')
        .filter('metadata->>stripeCheckoutSessionId', 'eq', session.id)
        .maybeSingle();

      if (checkoutSession?.completed_at) {
        this.logger.log(
          `Checkout session ${session.id} already completed -- skipping`,
        );
        return;
      }

      // Get the Stripe subscription ID created by Stripe for this checkout
      const stripeSubscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription as any)?.id;

      if (!stripeSubscriptionId) {
        this.logger.warn(
          `No subscription in completed checkout session ${session.id}`,
        );
        return;
      }

      // Resolve customer
      const stripeCustomerId =
        typeof session.customer === 'string'
          ? session.customer
          : (session.customer as any)?.id;

      const { data: customer, error: customerFetchError } = await supabase
        .from('customers')
        .select('id, organization_id')
        .eq('stripe_customer_id', stripeCustomerId)
        .single();

      if (customerFetchError || !customer) {
        this.logger.error(
          `Customer not found for stripe_customer_id ${stripeCustomerId}`,
        );
        return;
      }

      const customerId = customer.id;

      // Get price details
      const { data: price } = await supabase
        .from('product_prices')
        .select(
          'stripe_price_id, price_amount, price_currency, recurring_interval, recurring_interval_count',
        )
        .eq('id', priceId)
        .single();

      if (!price) {
        this.logger.error(`Price not found for priceId ${priceId}`);
        return;
      }

      // Get the connected Stripe account ID from our checkout session metadata
      const checkoutSessionMeta = (checkoutSession?.metadata as any) || {};
      const stripeAccountId = checkoutSessionMeta.stripeAccountId as
        | string
        | undefined;

      let stripeSub: any;
      try {
        stripeSub = await this.stripeService.getSubscription(
          stripeSubscriptionId,
          stripeAccountId,
        );
      } catch (err) {
        this.logger.error(
          `Failed to retrieve Stripe subscription ${stripeSubscriptionId}:`,
          err,
        );
        return;
      }

      // Use actual amount/currency from Stripe subscription (handles adaptive pricing)
      const stripeSubItem = stripeSub.items?.data?.[0];
      const actualAmount =
        stripeSubItem?.price?.unit_amount ?? price.price_amount ?? 0;

      // -- HANDLE UPGRADE/DOWNGRADE BEFORE creating/updating subscription --
      const existingSubscriptionId: string | null =
        (checkoutSessionMeta.existingSubscriptionId as string) ||
        (stripeSub.metadata?.existingSubscriptionId as string) ||
        null;

      if (existingSubscriptionId) {
        await this.transitionService.handleTransition(
          existingSubscriptionId,
          stripeAccountId || '',
          actualAmount,
          checkoutSession?.id,
        );
      } else {
        await this.transitionService.detectAndTransition(
          customerId,
          productId,
          stripeAccountId || '',
          actualAmount,
          checkoutSession?.id,
        );
      }

      // Dedup guard
      await this.transitionService.cleanupDuplicateSubscriptions(
        customerId,
        productId,
        stripeAccountId || '',
      );

      // -- NOW create/update subscription in DB --
      // Check for existing subscription by stripe_subscription_id first
      const { data: existingByStripeId } = await supabase
        .from('subscriptions')
        .select('id, status')
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .maybeSingle();

      let subscriptionId: string;

      if (existingByStripeId) {
        this.logger.log(
          `Subscription ${stripeSubscriptionId} already in database -- updating status`,
        );
        await supabase
          .from('subscriptions')
          .update({
            status: stripeSub.status,
            current_period_start: extractPeriodStart(stripeSub),
            current_period_end: extractPeriodEnd(stripeSub),
          })
          .eq('id', existingByStripeId.id);

        subscriptionId = existingByStripeId.id;
      } else {
        // Check for existing active subscription by (customer_id, product_id)
        // to avoid violating idx_unique_active_subscription constraint
        const { data: existingByCustomerProduct } = await supabase
          .from('subscriptions')
          .select('id, status, stripe_subscription_id')
          .eq('customer_id', customerId)
          .eq('product_id', productId)
          .in('status', ['active', 'trialing', 'incomplete', 'past_due'])
          .is('ended_at', null)
          .maybeSingle();

        const actualCurrency =
          stripeSub.currency ?? price.price_currency ?? 'usd';

        if (existingByCustomerProduct) {
          // Update existing subscription with new Stripe subscription ID
          this.logger.log(
            `Updating existing subscription ${existingByCustomerProduct.id} ` +
              `(${existingByCustomerProduct.stripe_subscription_id} -> ${stripeSubscriptionId})`,
          );
          await supabase
            .from('subscriptions')
            .update({
              stripe_subscription_id: stripeSubscriptionId,
              price_id: priceId,
              status: stripeSub.status,
              current_period_start: extractPeriodStart(stripeSub),
              current_period_end: extractPeriodEnd(stripeSub),
              amount: actualAmount,
              currency: actualCurrency,
              metadata: {
                created_from: 'checkout_session_completed',
                stripeCheckoutSessionId: session.id,
                metadataId,
              },
            })
            .eq('id', existingByCustomerProduct.id);

          subscriptionId = existingByCustomerProduct.id;
        } else {
          // Create new subscription record
          const subscriptionData = {
            customer_id: customerId,
            organization_id: customer.organization_id,
            product_id: productId,
            price_id: priceId,
            stripe_subscription_id: stripeSubscriptionId,
            status: stripeSub.status,
            current_period_start: extractPeriodStart(stripeSub),
            current_period_end: extractPeriodEnd(stripeSub),
            trial_end: stripeSub.trial_end
              ? new Date(stripeSub.trial_end * 1000).toISOString()
              : null,
            trial_start: stripeSub.trial_start
              ? new Date(stripeSub.trial_start * 1000).toISOString()
              : null,
            cancel_at_period_end: false,
            amount: actualAmount,
            currency: actualCurrency,
            metadata: {
              created_from: 'checkout_session_completed',
              stripeCheckoutSessionId: session.id,
              metadataId,
            },
          };

          const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .insert(subscriptionData)
            .select()
            .single();

          if (subError) {
            this.logger.error(
              'Failed to save subscription from checkout session:',
              subError,
            );
            return;
          }

          subscriptionId = subscription.id;
        }
      }

      this.logger.log(
        `Subscription ${subscriptionId} processed from checkout session ${session.id}`,
      );

      // Invalidate product revenue metrics cache
      const cacheKey = `product-metrics:${productId}`;
      await this.cacheManager.del(cacheKey);

      // Grant features -- un-revoke existing grants or insert new ones
      await this.entitlementService.ensureGrantsForSubscription(
        customerId,
        subscriptionId,
        productId,
      );

      // Update checkout session record
      if (checkoutSession) {
        await supabase
          .from('checkout_sessions')
          .update({
            completed_at: new Date().toISOString(),
            subscription_id: subscriptionId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', checkoutSession.id);
      }

      // Track discount redemptions. The actual applied coupon is whatever
      // Stripe ended up using (could be the BOS-pre-applied one or a promo
      // code the customer typed during checkout).
      await this.incrementDiscountRedemptions(
        ctx,
        session,
        checkoutSession?.metadata as Record<string, unknown> | null,
        organizationId,
        subscriptionId,
      );

      // Best-effort: populate customer country from card
      if (customer) {
        const dpm = stripeSub?.default_payment_method;
        const pmId = typeof dpm === 'string' ? dpm : (dpm?.id ?? null);
        this.logger.log(
          `[CardCountry] checkout-session path -- customerId=${customerId}, ` +
            `default_payment_method=${JSON.stringify(dpm)}, pmId=${pmId}, ` +
            `stripeAccountId=${stripeAccountId}`,
        );
        await this.tryUpdateCustomerCardCountry(
          ctx,
          customerId,
          pmId,
          stripeAccountId,
        );
      }

      this.logger.log(`Checkout session ${session.id} processed successfully`);
    } catch (error) {
      this.logger.error('Error handling checkout.session.completed:', error);
    }
  }

  /**
   * Increment `discounts.redemptions_count` for any coupon that Stripe
   * actually applied to this session. Reads coupons from
   * `session.total_details.breakdown.discounts` (set when the customer
   * typed a promo code) and falls back to the BOS-pre-applied discount
   * recorded in `checkout_sessions.metadata.appliedDiscountId`.
   */
  private async incrementDiscountRedemptions(
    ctx: WebhookContext,
    session: Stripe.Checkout.Session,
    checkoutSessionMetadata: Record<string, unknown> | null,
    organizationId: string,
    subscriptionId: string,
  ): Promise<void> {
    try {
      const supabase = ctx.supabase;
      const totalDiscount = session.total_details?.amount_discount ?? 0;
      const breakdownDiscounts =
        (
          session.total_details?.breakdown as
            | { discounts?: Array<{ discount?: { coupon?: { id?: string } } }> }
            | undefined
        )?.discounts ?? [];

      const stripeCouponIds = new Set<string>();
      for (const d of breakdownDiscounts) {
        const couponId = d.discount?.coupon?.id;
        if (couponId) stripeCouponIds.add(couponId);
      }

      const matchedDiscountIds = new Set<string>();

      if (stripeCouponIds.size > 0) {
        const { data: discounts } = await supabase
          .from('discounts')
          .select('id, stripe_coupon_id')
          .eq('organization_id', organizationId)
          .in('stripe_coupon_id', Array.from(stripeCouponIds));

        for (const d of discounts || []) {
          if (d.id) {
            matchedDiscountIds.add(d.id);
          }
        }
      }

      const preAppliedId = checkoutSessionMetadata?.appliedDiscountId as
        | string
        | undefined;
      if (preAppliedId) matchedDiscountIds.add(preAppliedId);

      if (matchedDiscountIds.size === 0) return;

      // Persist applied-discount info on the subscription so the rest of
      // the system (billing history, customer drawer) sees it. We only have
      // a single discount column on subscriptions, so prefer the pre-applied
      // one if both are present.
      const primaryDiscountId =
        preAppliedId || Array.from(matchedDiscountIds)[0];
      const appliedDiscountCode =
        (checkoutSessionMetadata?.appliedDiscountCode as string | undefined) ||
        null;
      await supabase
        .from('subscriptions')
        .update({
          discount_id: primaryDiscountId,
          discount_amount: totalDiscount > 0 ? totalDiscount : null,
          discount_code: appliedDiscountCode,
        })
        .eq('id', subscriptionId);

      for (const discountId of matchedDiscountIds) {
        const { error: rpcError } = await supabase.rpc(
          'increment_discount_redemptions',
          { p_discount_id: discountId },
        );
        if (rpcError) {
          this.logger.warn(
            `increment_discount_redemptions failed for ${discountId}: ${rpcError.message}`,
          );
        }
      }

      this.logger.log(
        `Incremented redemptions_count for ${matchedDiscountIds.size} discount(s) on session ${session.id}`,
      );
    } catch (error) {
      this.logger.warn(
        `Non-critical: failed to increment discount redemptions for session ${session.id}:`,
        error,
      );
    }
  }

  /**
   * Best-effort: update customer's billing country from their card.
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

      const { data: customer } = await supabase
        .from('customers')
        .select('id, billing_address')
        .eq('id', customerId)
        .single();

      if (!customer) return;

      const existingAddress =
        (customer.billing_address as Record<string, unknown>) || {};
      if (existingAddress.country) return;

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
