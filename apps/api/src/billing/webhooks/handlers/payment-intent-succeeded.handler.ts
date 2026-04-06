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
import { RedisService } from '../../../redis/redis.service';
import { RefundService } from '../../../stripe/refund.service';

/**
 * Handles `payment_intent.succeeded` webhook events.
 *
 * Routes to one of two sub-flows:
 * 1. **Direct subscription flow** -- subscription already exists (created during checkout).
 *    Updates status to active, handles upgrade/downgrade, grants features.
 * 2. **Legacy flow** -- subscription was NOT created during checkout.
 *    Creates a Stripe subscription in the webhook (backward compat).
 *
 * Also resolves race conditions where the PaymentIntent belongs to an existing
 * Stripe subscription but our DB hasn't committed yet (invoice-based resolution).
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
    private readonly redisService: RedisService,
    private readonly refundService: RefundService,
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
        this.logger.warn(
          `Payment intent ${paymentIntent.id} not found in database - may be from a different source`,
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
      const organizationId = metadata.organizationId;
      const productId = metadata.productId;
      const priceId = metadata.priceId;

      if (!organizationId || !productId || !priceId) {
        this.logger.error(
          'Missing required metadata in payment intent:',
          metadata,
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
              const inv = await this.stripeService
                .getClient()
                .invoices.retrieve(invoiceId, {
                  stripeAccount:
                    paymentIntentRecord.stripe_account_id || undefined,
                });
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
            `Resolved subscription ${resolvedStripeSubId} from invoice -- routing to direct flow instead of legacy`,
          );
          await this.handleDirectSubscriptionPaymentSuccess(
            ctx,
            paymentIntent,
            paymentIntentRecord,
            checkoutSession,
            resolvedStripeSubId,
          );
        } else {
          // Legacy flow: subscription was NOT created during checkout.
          // Fall back to creating one now.
          this.logger.log(
            `Legacy flow: creating subscription in webhook for PI ${paymentIntent.id}`,
          );
          await this.handleLegacyPaymentIntentSuccess(
            ctx,
            paymentIntent,
            paymentIntentRecord,
            checkoutSession,
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
    paymentIntentRecord: any,
    checkoutSession: any,
    stripeSubscriptionId: string,
  ): Promise<void> {
    const supabase = ctx.supabase;
    const metadata = paymentIntent.metadata || {};
    const checkoutMetadata = checkoutSession?.metadata;
    const organizationId = metadata.organizationId;
    const productId = metadata.productId;
    const priceId = metadata.priceId;
    const customerId = metadata.customerId || paymentIntentRecord.customer_id;

    this.logger.log(
      `Direct subscription flow: updating subscription ${stripeSubscriptionId} to active`,
    );

    // Get the Stripe account ID
    const stripeAccountId =
      paymentIntentRecord.stripe_account_id ||
      checkoutMetadata?.stripeAccountId;

    // Fetch the updated subscription from Stripe to get current status and period data
    let stripeSubscription: Stripe.Subscription | null = null;
    if (stripeAccountId) {
      try {
        stripeSubscription = await this.stripeService
          .getClient()
          .subscriptions.retrieve(stripeSubscriptionId, {
            stripeAccount: stripeAccountId,
          });
      } catch (e) {
        this.logger.warn(
          `Could not fetch subscription ${stripeSubscriptionId} from Stripe:`,
          e,
        );
      }
    }

    // Find existing subscription record in our DB
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .single();

    // Build update data from Stripe subscription (or use defaults)
    const subData = stripeSubscription as any;
    const newStatus = stripeSubscription?.status || 'active';
    const updateData: any = {
      status: newStatus,
      payment_intent_id: paymentIntentRecord.id,
      updated_at: new Date().toISOString(),
    };

    if (subData?.current_period_start) {
      updateData.current_period_start = new Date(
        subData.current_period_start * 1000,
      ).toISOString();
    }
    if (subData?.current_period_end) {
      updateData.current_period_end = new Date(
        subData.current_period_end * 1000,
      ).toISOString();
    }

    // Apply discount info from checkout metadata
    if (checkoutMetadata?.appliedDiscountId) {
      updateData.discount_id = checkoutMetadata.appliedDiscountId;
      updateData.discount_amount = checkoutMetadata.discountAmount
        ? parseInt(String(checkoutMetadata.discountAmount), 10)
        : null;
      updateData.discount_code = checkoutMetadata.appliedDiscountCode || null;
    }

    // Update metadata
    const existingMeta = (existingSubscription?.metadata as any) || {};
    updateData.metadata = {
      ...existingMeta,
      payment_intent_id: paymentIntentRecord.id,
      activated_from: 'direct_subscription_payment_succeeded',
    };

    // -- HANDLE UPGRADE/DOWNGRADE BEFORE creating/updating subscription --
    const existingSubId =
      checkoutMetadata?.existingSubscriptionId ||
      (stripeSubscription as any)?.metadata?.existingSubscriptionId ||
      null;

    if (existingSubId) {
      const newAmount = paymentIntentRecord.amount || 0;
      await this.transitionService.handleTransition(
        existingSubId as string,
        stripeAccountId,
        newAmount,
        checkoutSession?.id,
      );
    }

    // -- NOW create/update subscription in DB --
    let subscription: any;

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
      typeof directPmRaw === 'string' ? directPmRaw : (directPmRaw as any)?.id;
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
   * Legacy flow: subscription was NOT created during checkout.
   * Create subscription in the webhook (old behavior, for backward compat).
   */
  private async handleLegacyPaymentIntentSuccess(
    ctx: WebhookContext,
    paymentIntent: Stripe.PaymentIntent,
    paymentIntentRecord: any,
    checkoutSession: any,
  ): Promise<void> {
    const supabase = ctx.supabase;
    const metadata = paymentIntent.metadata || {};
    const checkoutMetadata = (checkoutSession?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const organizationId = metadata.organizationId;
    const externalUserId = metadata.externalUserId;
    const productId = metadata.productId;
    const priceId = metadata.priceId;
    const trialDays = parseInt(metadata.trialDays || '0', 10);

    // Ensure customer exists
    let customerId = paymentIntentRecord.customer_id as string | undefined;
    const stripeCustomerId =
      typeof paymentIntent.customer === 'string'
        ? paymentIntent.customer
        : paymentIntent.customer?.id;

    if (!stripeCustomerId) {
      this.logger.error('No Stripe customer ID in payment intent');
      return;
    }

    if (!customerId) {
      const customerData = {
        organization_id: organizationId,
        stripe_customer_id: stripeCustomerId,
        external_id: externalUserId,
        email: metadata.customerEmail?.toLowerCase(),
        name: metadata.customerName,
        updated_at: new Date().toISOString(),
      };

      let retries = 3;
      while (retries > 0) {
        const { data: customer, error: customerError } = await supabase
          .from('customers')
          .upsert(customerData, {
            onConflict: 'organization_id,stripe_customer_id',
            ignoreDuplicates: false,
          })
          .select()
          .single();

        if (!customerError) {
          customerId = customer.id;
          break;
        }

        if (customerError.code === '23505' && retries > 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * (4 - retries)),
          );
          retries--;

          const { data: existingCustomer } = await supabase
            .from('customers')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('stripe_customer_id', stripeCustomerId)
            .single();

          if (existingCustomer) {
            customerId = existingCustomer.id;
            break;
          }
        } else {
          this.logger.error('Failed to create/find customer:', customerError);
          return;
        }
      }

      await supabase
        .from('payment_intents')
        .update({ customer_id: customerId })
        .eq('id', paymentIntentRecord.id);
    }

    if (!customerId) {
      this.logger.error('Failed to ensure customer exists');
      return;
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

    // Check for existing subscriptions
    const { data: allSubscriptions } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, created_at, price_id')
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    let reactivatedSubscriptionId: string | null = null;

    if (allSubscriptions && allSubscriptions.length > 0) {
      const activeSubscription = allSubscriptions.find(
        (sub) =>
          ['active', 'trialing', 'past_due'].includes(sub.status) &&
          sub.stripe_subscription_id?.startsWith('sub_'),
      );

      if (activeSubscription) {
        this.logger.log(
          `Subscription already exists for customer ${customerId}: ${activeSubscription.id}`,
        );
        return;
      }

      const canceledSubscription = allSubscriptions.find((sub) =>
        ['canceled', 'ended'].includes(sub.status),
      );
      if (canceledSubscription) {
        reactivatedSubscriptionId = canceledSubscription.id;
      }

      // Clean up invalid subscriptions
      const invalidSubs = allSubscriptions.filter(
        (sub) =>
          sub.status === 'incomplete' &&
          (!sub.stripe_subscription_id ||
            !sub.stripe_subscription_id.startsWith('sub_')),
      );
      for (const invalidSub of invalidSubs) {
        await supabase.from('subscriptions').delete().eq('id', invalidSub.id);
      }
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

    // Attach payment method
    if (paymentIntent.payment_method) {
      try {
        const paymentMethodId =
          typeof paymentIntent.payment_method === 'string'
            ? paymentIntent.payment_method
            : paymentIntent.payment_method.id;

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
      } catch (pmError) {
        this.logger.error('Failed to attach payment method:', pmError);
      }
    }

    // Create subscription with trial_end deferral (legacy double-charge prevention)
    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: stripeCustomerId,
      items: [{ price: price.stripe_price_id }],
      payment_behavior: 'allow_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      metadata: {
        organizationId,
        customerId,
        productId,
        priceId,
        externalUserId,
      },
      expand: ['latest_invoice.payment_intent'],
    };

    const now = Math.floor(Date.now() / 1000);
    const billingInterval =
      metadata.billingInterval || price.recurring_interval || 'month';
    const billingIntervalCount =
      parseInt(metadata.billingIntervalCount || '1', 10) || 1;
    const deferSeconds =
      billingInterval === 'year'
        ? billingIntervalCount * 365 * 24 * 60 * 60
        : billingIntervalCount * 30 * 24 * 60 * 60;

    let shouldGrantTrial = false;
    if (trialDays > 0) {
      // Acquire trial lock to prevent concurrent trial grants
      const trialLockKey = `trial-lock:${customerId}:${productId}`;
      const acquiredTrialLock = await this.redisService.setIdempotencyKey(
        trialLockKey,
        Date.now().toString(),
        30000, // 30s TTL
      );

      if (!acquiredTrialLock) {
        this.logger.warn(
          `Trial lock not acquired for ${customerId}:${productId} -- proceeding without trial`,
        );
      }

      const { data: trialEligible } = await supabase.rpc(
        'check_trial_eligibility',
        {
          p_customer_id: customerId,
          p_product_id: productId,
        },
      );
      if (trialEligible && acquiredTrialLock) {
        subscriptionParams.trial_end =
          now + deferSeconds + trialDays * 24 * 60 * 60;
        shouldGrantTrial = true;
      } else {
        subscriptionParams.trial_end = now + deferSeconds;
      }
    } else {
      subscriptionParams.trial_end = now + deferSeconds;
    }

    if (paymentIntent.payment_method) {
      const pmId =
        typeof paymentIntent.payment_method === 'string'
          ? paymentIntent.payment_method
          : paymentIntent.payment_method.id;
      subscriptionParams.default_payment_method = pmId;
    }

    if (checkoutMetadata.stripeCouponId) {
      const discountDuration =
        (checkoutMetadata.discountDuration as string) || 'once';
      if (discountDuration !== 'once') {
        subscriptionParams.discounts = [
          { coupon: checkoutMetadata.stripeCouponId as string },
        ];
      }
    }

    // Handle upgrade/downgrade BEFORE creating new Stripe subscription
    if (checkoutMetadata.existingSubscriptionId) {
      const newAmount = price.price_amount || 0;
      await this.transitionService.handleTransition(
        checkoutMetadata.existingSubscriptionId as string,
        stripeAccountId,
        newAmount,
        checkoutSession?.id,
      );
    }

    // Create Stripe subscription
    let stripeSubscription;
    try {
      const idempotencyKey = `legacy-sub:${customerId}:${productId}:${Date.now()}`;
      stripeSubscription = await this.stripeService.createSubscription(
        subscriptionParams,
        stripeAccountId,
        idempotencyKey,
      );
    } catch (subError) {
      this.logger.error('Failed to create Stripe subscription:', subError);
      return;
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('organization_id')
      .eq('id', customerId)
      .single();

    if (!customer) {
      this.logger.error(`Customer ${customerId} not found`);
      return;
    }

    const subscriptionData = {
      customer_id: customerId,
      organization_id: customer.organization_id,
      product_id: productId,
      price_id: priceId,
      stripe_subscription_id: stripeSubscription.id,
      status: stripeSubscription.status,
      current_period_start: stripeSubscription.current_period_start
        ? new Date(stripeSubscription.current_period_start * 1000).toISOString()
        : new Date().toISOString(),
      current_period_end: stripeSubscription.current_period_end
        ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      trial_end: stripeSubscription.trial_end
        ? new Date(stripeSubscription.trial_end * 1000).toISOString()
        : null,
      trial_start: stripeSubscription.trial_start
        ? new Date(stripeSubscription.trial_start * 1000).toISOString()
        : null,
      cancel_at_period_end: false,
      amount: price.price_amount || 0,
      currency: price.price_currency || 'usd',
      discount_id: (checkoutMetadata.appliedDiscountId as string) || null,
      discount_amount: checkoutMetadata.discountAmount
        ? parseInt(String(checkoutMetadata.discountAmount as number), 10)
        : null,
      discount_code: (checkoutMetadata.appliedDiscountCode as string) || null,
      payment_intent_id: paymentIntentRecord.id,
      metadata: {
        payment_intent_id: paymentIntentRecord.id,
        created_from: 'legacy_payment_intent_succeeded',
        hasRealTrial: shouldGrantTrial,
        trialDays: shouldGrantTrial ? trialDays : 0,
      },
    };

    let subscription: any;
    let subError: any;

    if (reactivatedSubscriptionId) {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          ...subscriptionData,
          canceled_at: null,
          ended_at: null,
          metadata: {
            ...subscriptionData.metadata,
            reactivatedAt: new Date().toISOString(),
          },
        })
        .eq('id', reactivatedSubscriptionId)
        .select()
        .single();
      subscription = data;
      subError = error;
    } else {
      const { data, error } = await supabase
        .from('subscriptions')
        .insert(subscriptionData)
        .select()
        .single();
      subscription = data;
      subError = error;
    }

    if (subError) {
      this.logger.error('Failed to save subscription:', subError);
      await this.refundService.refundPaymentOnFailure({
        paymentIntentId: paymentIntent.id,
        stripeAccountId,
        reason: `subscription_creation_failed: ${subError.message}`,
      });
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

    // Invalidate cache
    await this.cacheManager.del(`product-metrics:${productId}`);

    // Grant features
    await this.entitlementService.ensureGrantsForSubscription(
      customerId,
      subscription.id,
      productId,
    );

    // Update checkout session
    await supabase
      .from('checkout_sessions')
      .update({
        subscription_id: subscription.id,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_intent_id', paymentIntentRecord.id);

    this.logger.log(`Legacy flow completed for PI ${paymentIntent.id}`);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

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
