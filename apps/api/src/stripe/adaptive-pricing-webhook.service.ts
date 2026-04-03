import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from './stripe.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SubscriptionTransitionService } from '../subscriptions/subscription-transition.service';

@Injectable()
export class AdaptivePricingWebhookService {
  private readonly logger = new Logger(AdaptivePricingWebhookService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    @Inject(forwardRef(() => SubscriptionTransitionService))
    private readonly transitionService: SubscriptionTransitionService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Handle checkout.session.completed webhook (adaptive pricing path).
   * Stripe creates the subscription for us — we sync it to our DB.
   */
  async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    try {
      this.logger.log(`Checkout session completed: ${session.id}`);

      // Only handle our adaptive mode sessions; ignore others (e.g. Stripe-hosted)
      const metadata = (session.metadata || {}) as Record<string, string>;
      const metadataId = metadata.metadataId;
      const organizationId = metadata.organizationId;
      const productId = metadata.productId;
      const priceId = metadata.priceId;

      if (!organizationId || !productId || !priceId) {
        this.logger.log(
          `Checkout session ${session.id} missing BillingOS metadata — skipping`,
        );
        return;
      }

      const supabase = this.supabaseService.getClient();

      // Find our checkout_sessions record by Stripe session ID (stored in metadata)
      const { data: checkoutSession } = await supabase
        .from('checkout_sessions')
        .select('id, subscription_id, completed_at, organization_id, metadata')
        .filter('metadata->>stripeCheckoutSessionId', 'eq', session.id)
        .maybeSingle();

      if (checkoutSession?.completed_at) {
        this.logger.log(
          `Checkout session ${session.id} already completed — skipping`,
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
        stripeSub = await this.stripeService
          .getClient()
          .subscriptions.retrieve(stripeSubscriptionId, {
            stripeAccount: stripeAccountId,
          });
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

      // ── HANDLE UPGRADE/DOWNGRADE BEFORE creating/updating subscription ──
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

      // ── NOW create/update subscription in DB ──
      // Check for existing subscription by stripe_subscription_id first
      const { data: existingByStripeId } = await supabase
        .from('subscriptions')
        .select('id, status')
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .maybeSingle();

      let subscriptionId: string;

      if (existingByStripeId) {
        this.logger.log(
          `Subscription ${stripeSubscriptionId} already in database — updating status`,
        );
        await supabase
          .from('subscriptions')
          .update({
            status: stripeSub.status,
            current_period_start: stripeSub.current_period_start
              ? new Date(stripeSub.current_period_start * 1000).toISOString()
              : new Date().toISOString(),
            current_period_end: stripeSub.current_period_end
              ? new Date(stripeSub.current_period_end * 1000).toISOString()
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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
              `(${existingByCustomerProduct.stripe_subscription_id} → ${stripeSubscriptionId})`,
          );
          await supabase
            .from('subscriptions')
            .update({
              stripe_subscription_id: stripeSubscriptionId,
              price_id: priceId,
              status: stripeSub.status,
              current_period_start: stripeSub.current_period_start
                ? new Date(stripeSub.current_period_start * 1000).toISOString()
                : new Date().toISOString(),
              current_period_end: stripeSub.current_period_end
                ? new Date(stripeSub.current_period_end * 1000).toISOString()
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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
            current_period_start: stripeSub.current_period_start
              ? new Date(stripeSub.current_period_start * 1000).toISOString()
              : new Date().toISOString(),
            current_period_end: stripeSub.current_period_end
              ? new Date(stripeSub.current_period_end * 1000).toISOString()
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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

      // Grant features — un-revoke existing grants or insert new ones
      const { data: productFeatures } = await supabase
        .from('product_features')
        .select('feature_id, config')
        .eq('product_id', productId);

      if (productFeatures && productFeatures.length > 0) {
        // Un-revoke any previously revoked grants for this subscription
        await supabase
          .from('feature_grants')
          .update({ revoked_at: null })
          .eq('subscription_id', subscriptionId)
          .not('revoked_at', 'is', null);

        // Check which features already have grants
        const { data: existingGrants } = await supabase
          .from('feature_grants')
          .select('feature_id')
          .eq('subscription_id', subscriptionId);

        const existingFeatureIds = new Set(
          (existingGrants || []).map(
            (g: { feature_id: string }) => g.feature_id,
          ),
        );

        // Only insert grants for features that don't already have one
        const newGrants = productFeatures
          .filter((pf) => !existingFeatureIds.has(pf.feature_id))
          .map((pf) => ({
            customer_id: customerId,
            subscription_id: subscriptionId,
            feature_id: pf.feature_id,
            properties: pf.config || {},
            granted_at: new Date().toISOString(),
          }));

        if (newGrants.length > 0) {
          const { error: grantError } = await supabase
            .from('feature_grants')
            .insert(newGrants);

          if (grantError) {
            this.logger.error('Failed to grant features:', grantError);
          } else {
            this.logger.log(
              `Granted ${newGrants.length} new features from checkout session`,
            );
          }
        }

        this.logger.log(
          `Feature grants ensured for subscription ${subscriptionId} (${existingFeatureIds.size} existing, ${newGrants.length} new)`,
        );
      }

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

      // Best-effort: populate customer country from card
      if (customer) {
        const dpm = stripeSub?.default_payment_method;
        const pmId = typeof dpm === 'string' ? dpm : (dpm?.id ?? null);
        this.logger.log(
          `[CardCountry] checkout-session path — customerId=${customerId}, ` +
            `default_payment_method=${JSON.stringify(dpm)}, pmId=${pmId}, ` +
            `stripeAccountId=${stripeAccountId}`,
        );
        await this.tryUpdateCustomerCardCountry(
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
   * Best-effort: update customer's billing country from their card
   */
  private async tryUpdateCustomerCardCountry(
    customerId: string,
    paymentMethodId: string | null | undefined,
    stripeAccountId: string | null | undefined,
  ): Promise<void> {
    if (!paymentMethodId || !stripeAccountId) {
      this.logger.log(
        `[CardCountry] skipping — paymentMethodId=${paymentMethodId}, stripeAccountId=${stripeAccountId}`,
      );
      return;
    }

    try {
      const supabase = this.supabaseService.getClient();

      const { data: customer } = await supabase
        .from('customers')
        .select('id, billing_address')
        .eq('id', customerId)
        .single();

      if (!customer) return;

      const existingAddress =
        (customer.billing_address as Record<string, unknown>) || {};
      if (existingAddress.country) return;

      const paymentMethod = await this.stripeService
        .getClient()
        .paymentMethods.retrieve(paymentMethodId, {
          stripeAccount: stripeAccountId,
        });

      const cardCountry = paymentMethod.card?.country;
      this.logger.log(
        `[CardCountry] retrieved PM ${paymentMethodId} — type=${paymentMethod.type}, ` +
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
