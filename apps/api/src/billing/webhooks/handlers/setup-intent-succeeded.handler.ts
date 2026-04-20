import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import Stripe from 'stripe';
import { WebhookHandler, WebhookContext } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';
import { StripeService } from '../../../stripe/stripe.service';
import { RedisService } from '../../../redis/redis.service';
import { EntitlementService } from '../../entitlements/entitlement.service';
import { extractPeriodStart, extractPeriodEnd } from '../../utils/period-end.helper';

/**
 * Handles `setup_intent.succeeded` webhook events.
 *
 * Creates a subscription with trial_period_days for trial product checkouts.
 * The customer is NOT charged -- card is saved for future billing after trial ends.
 *
 * Flow:
 * 1. Validate trial checkout metadata
 * 2. Resolve customer (by stripe_customer_id or external_id)
 * 3. Verify no existing active subscription
 * 4. Attach payment method and set as default
 * 5. Create Stripe subscription with trial
 * 6. Save subscription to DB
 * 7. Grant features and update checkout session
 */
@Injectable()
export class SetupIntentSucceededHandler
  implements WebhookHandler, OnModuleInit
{
  private readonly logger = new Logger(SetupIntentSucceededHandler.name);

  constructor(
    private readonly router: WebhookRouter,
    private readonly stripeService: StripeService,
    private readonly redisService: RedisService,
    private readonly entitlementService: EntitlementService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  onModuleInit(): void {
    this.router.registerHandler('setup_intent.succeeded', this);
  }

  async handle(ctx: WebhookContext): Promise<void> {
    const setupIntent = ctx.event.data.object as Stripe.SetupIntent;

    try {
      this.logger.log(`Setup intent succeeded: ${setupIntent.id}`);

      const metadata = setupIntent.metadata || {};
      if (metadata.isTrialCheckout !== 'true') {
        this.logger.log(
          `Setup intent ${setupIntent.id} is not a trial checkout -- skipping`,
        );
        return;
      }

      const supabase = ctx.supabase;

      const organizationId = metadata.organizationId;
      const externalUserId = metadata.externalUserId;
      const productId = metadata.productId;
      const priceId = metadata.priceId;
      const trialDays = parseInt(metadata.trialDays || '0', 10);

      if (!organizationId || !productId || !priceId) {
        this.logger.error(
          'Missing required metadata in setup intent:',
          metadata,
        );
        return;
      }

      // Find our checkout session
      const { data: checkoutSession } = await supabase
        .from('checkout_sessions')
        .select('id, metadata')
        .filter('metadata->>stripeSetupIntentId', 'eq', setupIntent.id)
        .maybeSingle();

      const checkoutMeta = (checkoutSession?.metadata as any) || {};

      // Resolve customer
      const stripeCustomerId =
        typeof setupIntent.customer === 'string'
          ? setupIntent.customer
          : (setupIntent.customer as any)?.id;

      if (!stripeCustomerId) {
        this.logger.error('No Stripe customer ID in setup intent');
        return;
      }

      const { data: customer } = await supabase
        .from('customers')
        .select('id, organization_id')
        .eq('stripe_customer_id', stripeCustomerId)
        .maybeSingle();

      let customerId: string;
      let customerOrgId: string;

      if (!customer) {
        // Try by external_id
        const { data: customerByExtId } = await supabase
          .from('customers')
          .select('id, organization_id')
          .eq('organization_id', organizationId)
          .eq('external_id', externalUserId)
          .maybeSingle();

        if (!customerByExtId) {
          this.logger.error(
            `Customer not found for setup intent ${setupIntent.id}`,
          );
          return;
        }
        customerId = customerByExtId.id;
        customerOrgId = customerByExtId.organization_id;
      } else {
        customerId = customer.id;
        customerOrgId = customer.organization_id;
      }

      // Get organization's Stripe account
      const { data: organization } = await supabase
        .from('organizations')
        .select('accounts!inner(stripe_id)')
        .eq('id', organizationId)
        .single();

      if (!organization?.accounts) {
        this.logger.error(
          `Organization ${organizationId} Stripe account not found`,
        );
        return;
      }

      const stripeAccountId = (organization.accounts as any).stripe_id;

      // Check for existing active subscription
      const { data: existingSubs } = await supabase
        .from('subscriptions')
        .select('id, status, stripe_subscription_id')
        .eq('customer_id', customerId)
        .eq('product_id', productId)
        .in('status', ['active', 'trialing', 'incomplete', 'past_due']);

      if (existingSubs && existingSubs.length > 0) {
        this.logger.log(
          `Active subscription already exists for customer ${customerId} / product ${productId}`,
        );
        return;
      }

      // Get price details
      const { data: price } = await supabase
        .from('product_prices')
        .select(
          'stripe_price_id, price_amount, price_currency, recurring_interval, recurring_interval_count',
        )
        .eq('id', priceId)
        .single();

      if (!price?.stripe_price_id) {
        this.logger.error(`Stripe price not found for ${priceId}`);
        return;
      }

      // Attach payment method and set as default
      const paymentMethodId =
        typeof setupIntent.payment_method === 'string'
          ? setupIntent.payment_method
          : (setupIntent.payment_method as any)?.id;

      if (paymentMethodId) {
        try {
          await this.stripeService.attachPaymentMethodToCustomer(
            paymentMethodId,
            stripeCustomerId,
            stripeAccountId,
          );
          await this.stripeService.updateCustomer(
            stripeCustomerId,
            {
              invoice_settings: {
                default_payment_method: paymentMethodId,
              },
            },
            stripeAccountId,
          );
          this.logger.log(
            `Payment method ${paymentMethodId} attached to customer ${stripeCustomerId}`,
          );
        } catch (pmError) {
          this.logger.error('Failed to attach payment method:', pmError);
        }
      }

      // Build subscription params
      const applicationFeePercent = 5;
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: stripeCustomerId,
        items: [{ price: price.stripe_price_id }],
        payment_behavior: 'allow_incomplete', // Trial has no upfront payment -- don't require client confirmation
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        application_fee_percent: applicationFeePercent,
        metadata: {
          organizationId,
          customerId,
          productId,
          priceId,
          externalUserId,
        },
        expand: ['latest_invoice.payment_intent'],
      };

      // Set default payment method
      if (paymentMethodId) {
        subscriptionParams.default_payment_method = paymentMethodId;
      }

      // Grant trial (with Redis lock to prevent race conditions)
      if (trialDays > 0) {
        const trialLockKey = `trial-lock:${customerId}:${productId}`;
        const acquiredLock = await this.redisService.setIdempotencyKey(
          trialLockKey,
          Date.now().toString(),
          30000, // 30s TTL
        );

        if (!acquiredLock) {
          this.logger.warn(
            `Trial lock not acquired for ${customerId}:${productId} -- another request is processing`,
          );
          return;
        }

        const { data: trialEligible } = await supabase.rpc(
          'check_trial_eligibility',
          { p_customer_id: customerId, p_product_id: productId },
        );

        if (trialEligible) {
          subscriptionParams.trial_period_days = trialDays;
          this.logger.log(
            `Granting ${trialDays}-day trial for customer ${customerId} on product ${productId}`,
          );
        } else {
          this.logger.warn(
            `Trial not eligible for customer ${customerId} -- creating subscription without trial`,
          );
        }
      }

      // Apply discount coupon if one was used
      if (checkoutMeta?.stripeCouponId) {
        subscriptionParams.discounts = [
          { coupon: checkoutMeta.stripeCouponId },
        ];
        this.logger.log(
          `Attaching coupon ${checkoutMeta.stripeCouponId} to trial subscription`,
        );
      }

      // Create Stripe subscription
      let stripeSubscription;
      try {
        const idempotencyKey = `trial-sub:${customerId}:${productId}:${Date.now()}`;
        stripeSubscription = await this.stripeService.createSubscription(
          subscriptionParams,
          stripeAccountId,
          idempotencyKey,
        );
        this.logger.log(
          `Stripe subscription ${stripeSubscription.id} created (trial)`,
        );
      } catch (subError) {
        this.logger.error(
          'Failed to create Stripe subscription (trial):',
          subError,
        );
        return;
      }

      // Save subscription to database
      const subData = stripeSubscription;
      const subscriptionData = {
        customer_id: customerId,
        organization_id: customerOrgId,
        product_id: productId,
        price_id: priceId,
        stripe_subscription_id: stripeSubscription.id,
        status: stripeSubscription.status,
        current_period_start: extractPeriodStart(
          subData as unknown as Record<string, unknown>,
        ),
        current_period_end: extractPeriodEnd(
          subData as unknown as Record<string, unknown>,
        ),
        trial_end: subData.trial_end
          ? new Date(subData.trial_end * 1000).toISOString()
          : null,
        trial_start: subData.trial_start
          ? new Date(subData.trial_start * 1000).toISOString()
          : null,
        cancel_at_period_end: false,
        amount: price.price_amount || 0,
        currency: price.price_currency || 'usd',
        discount_id: checkoutMeta?.appliedDiscountId || null,
        discount_amount: checkoutMeta?.discountAmount
          ? parseInt(String(checkoutMeta.discountAmount), 10)
          : null,
        discount_code: checkoutMeta?.appliedDiscountCode || null,
        metadata: {
          setup_intent_id: setupIntent.id,
          created_from: 'setup_intent_succeeded',
          hasRealTrial: true,
          trialDays,
        },
      };

      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .insert(subscriptionData)
        .select()
        .single();

      if (subError) {
        this.logger.error('Failed to save trial subscription:', subError);
        // Cancel the Stripe subscription since we can't track it
        try {
          await this.stripeService.cancelSubscription(
            stripeSubscription.id,
            stripeAccountId,
          );
        } catch (cancelError) {
          this.logger.error(
            'Failed to cancel subscription after DB error:',
            cancelError,
          );
        }
        return;
      }

      // Update checkout session
      if (checkoutSession) {
        await supabase
          .from('checkout_sessions')
          .update({
            completed_at: new Date().toISOString(),
            subscription_id: subscription.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', checkoutSession.id);
      }

      // Invalidate cache
      const cacheKey = `product-metrics:${productId}`;
      await this.cacheManager.del(cacheKey);

      // Grant features
      await this.entitlementService.ensureGrantsForSubscription(
        customerId,
        subscription.id,
        productId,
      );

      // Capture card country
      this.logger.log(
        `[CardCountry] setup-intent path -- customerId=${customerId}, pmId=${paymentMethodId}, acct=${stripeAccountId}`,
      );
      await this.tryUpdateCustomerCardCountry(
        ctx,
        customerId,
        paymentMethodId,
        stripeAccountId,
      );

      this.logger.log(
        `Trial subscription flow completed for setup intent ${setupIntent.id}`,
      );
    } catch (error) {
      this.logger.error('Error handling setup_intent.succeeded:', error);
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

      const paymentMethod = await this.stripeService
        .getClient()
        .paymentMethods.retrieve(paymentMethodId, {
          stripeAccount: stripeAccountId,
        });

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
