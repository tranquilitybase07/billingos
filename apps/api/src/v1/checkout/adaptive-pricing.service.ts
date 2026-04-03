import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeService } from '../../stripe/stripe.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { CheckoutMetadataService } from './checkout-metadata.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { SubscriptionTransitionService } from '../../subscriptions/subscription-transition.service';
import { CheckoutSession } from './checkout.service';

@Injectable()
export class AdaptivePricingService {
  private readonly logger = new Logger(AdaptivePricingService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly stripeService: StripeService,
    private readonly supabaseService: SupabaseService,
    private readonly metadataService: CheckoutMetadataService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    @Inject(forwardRef(() => SubscriptionTransitionService))
    private readonly transitionService: SubscriptionTransitionService,
  ) {
    this.enabled =
      this.configService.get<string>('ENABLE_ADAPTIVE_PRICING', 'true') !==
      'false';
    this.logger.log(`Adaptive pricing enabled: ${this.enabled}`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async createCheckout(
    organizationId: string,
    externalUserId: string,
    product: any,
    price: any,
    stripeCustomerId: string,
    stripeAccountId: string,
    customerId: string,
    customerEmail?: string,
    customerName?: string,
    dto?: any,
    orgCurrency: string = 'usd',
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();

    const amount = price.price_amount || 0;
    const currency = price.price_currency || orgCurrency;

    // Create metadata record
    const checkoutMetadata = await this.metadataService.createMetadata({
      organizationId,
      customerId,
      productId: product.id,
      priceId: price.id,
      customerEmail: customerEmail || '',
      customerName: customerName || undefined,
      productName: product.name,
      priceAmount: amount,
      currency,
      billingInterval: price.recurring_interval as 'month' | 'year' | undefined,
      billingIntervalCount: price.recurring_interval_count || 1,
      trialPeriodDays: product.trial_days || undefined,
      shouldGrantTrial: false,
      featuresToGrant: [],
      successUrl:
        dto?.successUrl || `${process.env.APP_URL}/embed/checkout/complete`,
      cancelUrl:
        dto?.cancelUrl || `${process.env.APP_URL}/embed/checkout/cancel`,
      metadata: {
        externalUserId,
        ...dto?.metadata,
      },
    });

    // Cancel orphaned Stripe subscriptions for this customer+price
    // These can exist if a previous checkout completed but the webhook was missed
    try {
      const existingStripeSubs = await this.stripeService
        .getClient()
        .subscriptions.list(
          {
            customer: stripeCustomerId,
            price: price.stripe_price_id,
            status: 'all',
            limit: 10,
          },
          { stripeAccount: stripeAccountId },
        );

      for (const sub of existingStripeSubs.data) {
        if (['canceled', 'ended'].includes(sub.status)) continue;

        const { data: dbSub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();

        if (!dbSub) {
          this.logger.warn(
            `Canceling orphaned Stripe subscription ${sub.id} (status: ${sub.status}) for customer ${stripeCustomerId}`,
          );
          await this.stripeService
            .getClient()
            .subscriptions.cancel(sub.id, { stripeAccount: stripeAccountId });
        }
      }
    } catch (cleanupError) {
      this.logger.warn(
        'Failed to clean up orphaned subscriptions:',
        cleanupError,
      );
    }

    // Auto-detect plan change + handle pre-checkout cancellations via transition service
    let existingSubscriptionId: string | undefined =
      dto?.existingSubscriptionId;
    if (!existingSubscriptionId) {
      const preResult =
        await this.transitionService.handlePreCheckoutTransition(
          customerId,
          product.id,
          stripeAccountId,
        );
      existingSubscriptionId = preResult.remainingSubId;
    } else {
      const preResult =
        await this.transitionService.handlePreCheckoutTransition(
          customerId,
          product.id,
          stripeAccountId,
        );
      if (preResult.canceledSubId === existingSubscriptionId) {
        existingSubscriptionId = undefined;
      }
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Create Stripe Checkout Session in embedded mode with adaptive pricing
    const stripeSession = await this.stripeService
      .getClient()
      .checkout.sessions.create(
        {
          mode: 'subscription',
          currency,
          customer: stripeCustomerId,
          line_items: [{ price: price.stripe_price_id, quantity: 1 }],
          ui_mode: 'custom',
          adaptive_pricing: { enabled: true },
          // Skip card form for plan changes if customer has saved payment method
          ...(existingSubscriptionId
            ? { payment_method_collection: 'if_required' }
            : {}),
          subscription_data: {
            application_fee_percent: 5,
            // Only apply trial for NEW subscriptions, not plan changes
            ...(product.trial_days > 0 && !existingSubscriptionId
              ? { trial_period_days: product.trial_days }
              : {}),
            metadata: {
              metadataId: checkoutMetadata.id,
              organizationId,
              externalUserId,
              productId: product.id,
              priceId: price.id,
              ...(existingSubscriptionId ? { existingSubscriptionId } : {}),
            },
          },
          metadata: {
            metadataId: checkoutMetadata.id,
            organizationId,
            externalUserId,
            productId: product.id,
            priceId: price.id,
            ...(existingSubscriptionId ? { existingSubscriptionId } : {}),
          },
          return_url: `${process.env.APP_URL}/embed/checkout/complete`,
          expires_at: Math.floor(expiresAt.getTime() / 1000),
        } as any,
        { stripeAccount: stripeAccountId },
      );

    // Link metadata to this Stripe Checkout Session
    await this.metadataService.linkToCheckoutSession(
      checkoutMetadata.id,
      stripeSession.id,
    );

    // Create checkout_sessions record (no payment_intent_id for adaptive)
    const { data: checkoutSession, error: sessionError } = await supabase
      .from('checkout_sessions')
      .insert({
        organization_id: organizationId,
        session_token: externalUserId,
        payment_intent_id: null,
        customer_email: customerEmail,
        customer_name: customerName,
        customer_external_id: externalUserId,
        expires_at: expiresAt.toISOString(),
        metadata: {
          checkoutMode: 'adaptive',
          stripeCheckoutSessionId: stripeSession.id,
          clientSecret: stripeSession.client_secret,
          stripeAccountId,
          productId: product.id,
          priceId: price.id,
          customerId,
          priceAmount: amount,
          priceCurrency: currency,
          metadataId: checkoutMetadata.id,
          existingSubscriptionId,
          ...(dto?.metadata || {}),
        },
      })
      .select()
      .single();

    if (sessionError) {
      this.logger.error(
        'Failed to create adaptive checkout session:',
        sessionError,
      );
      throw new BadRequestException('Failed to create checkout session');
    }

    // Fetch product features for display
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    return {
      id: checkoutSession.id,
      clientSecret: stripeSession.client_secret!,
      paymentIntentId: '',
      amount,
      currency,
      totalAmount: amount,
      checkoutMode: 'adaptive',
      product: {
        name: product.name,
        description: product.description,
        interval: price.recurring_interval || 'month',
        intervalCount: price.recurring_interval_count || 1,
        features,
      },
      customer: {
        email: customerEmail,
        name: customerName,
      },
      stripeAccountId,
      trialDays: product.trial_days || 0,
    };
  }

  async getCheckoutStatus(
    session: any,
    metadata: any,
    orgCurrency: string = 'usd',
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();

    const productId = metadata.productId;
    const priceId = metadata.priceId;

    // Fetch product and price details
    const [{ data: product }, { data: price }] = await Promise.all([
      supabase.from('products').select('*').eq('id', productId).single(),
      supabase.from('product_prices').select('*').eq('id', priceId).single(),
    ]);

    if (!product || !price) {
      throw new NotFoundException(
        'Product or price not found for adaptive session',
      );
    }

    // Fetch product features
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    const isExpired =
      new Date(session.expires_at) < new Date() && !session.completed_at;

    // Check if subscription has been created (via webhook)
    let subscription: any = null;
    if (session.subscription_id) {
      const { data: subscriptionData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', session.subscription_id)
        .single();
      subscription = subscriptionData;
    }

    const status:
      | 'pending'
      | 'processing'
      | 'completed'
      | 'failed'
      | 'expired' = isExpired
      ? 'expired'
      : session.completed_at
        ? 'completed'
        : 'pending';

    return {
      id: session.id,
      clientSecret: metadata.clientSecret || '',
      paymentIntentId: '',
      amount: metadata.priceAmount || price.price_amount || 0,
      currency: metadata.priceCurrency || price.price_currency || orgCurrency,
      totalAmount: metadata.priceAmount || price.price_amount || 0,
      status,
      checkoutMode: 'adaptive',
      expiresAt: session.expires_at,
      product: {
        name: product.name,
        description: product.description || undefined,
        interval: price.recurring_interval || 'month',
        intervalCount: price.recurring_interval_count || 1,
        features,
      },
      customer: {
        email: session.customer_email || undefined,
        name: session.customer_name || undefined,
      },
      stripeAccountId: metadata.stripeAccountId || undefined,
      trialDays: product.trial_days || 0,
      subscription: subscription
        ? {
            id: subscription.id,
            customerId: subscription.customer_id,
            productId: subscription.product_id,
            priceId: subscription.price_id || '',
            status: subscription.status,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          }
        : undefined,
    };
  }

  async recreateCheckoutSessionForDiscount(
    session: any,
    sessionMetadata: Record<string, any>,
    discounts: Array<{ coupon: string }> | undefined,
    supabase: ReturnType<SupabaseService['getClient']>,
  ): Promise<{ clientSecret: string }> {
    const stripeClient = this.stripeService.getClient();

    const stripeAccountId = sessionMetadata.stripeAccountId as string;
    const oldStripeSessionId =
      sessionMetadata.stripeCheckoutSessionId as string;
    const currency = (sessionMetadata.priceCurrency as string) ?? 'usd';
    const metadataId = sessionMetadata.metadataId as string;
    const organizationId = session.organization_id as string;
    const externalUserId = session.customer_external_id as string;
    const customerId = sessionMetadata.customerId as string;
    const priceId = sessionMetadata.priceId as string;
    const productId = sessionMetadata.productId as string;

    // Look up Stripe IDs and trial_days from DB
    const [customerResult, priceResult, productResult] = await Promise.all([
      supabase
        .from('customers')
        .select('stripe_customer_id')
        .eq('id', customerId)
        .single(),
      supabase
        .from('product_prices')
        .select('stripe_price_id')
        .eq('id', priceId)
        .single(),
      supabase
        .from('products')
        .select('trial_days')
        .eq('id', productId)
        .single(),
    ]);

    const stripeCustomerId = customerResult.data?.stripe_customer_id;
    const stripePriceId = priceResult.data?.stripe_price_id;
    const trialDays = productResult.data?.trial_days ?? 0;

    if (!stripeCustomerId || !stripePriceId) {
      throw new BadRequestException(
        'Unable to recreate checkout session — missing customer or price',
      );
    }

    // 1. Expire old Stripe Checkout Session
    await stripeClient.checkout.sessions.expire(
      oldStripeSessionId,
      {},
      { stripeAccount: stripeAccountId },
    );
    this.logger.log(
      `Expired Stripe Checkout Session ${oldStripeSessionId} for discount recreation`,
    );

    // 2. Create new Stripe Checkout Session with same params + discounts
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const hasExistingSub = !!sessionMetadata.existingSubscriptionId;

    const newStripeSession = await stripeClient.checkout.sessions.create(
      {
        mode: 'subscription',
        currency,
        customer: stripeCustomerId,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        ui_mode: 'custom',
        adaptive_pricing: { enabled: true },
        // Skip card form for plan changes if customer has saved payment method
        ...(hasExistingSub ? { payment_method_collection: 'if_required' } : {}),
        subscription_data: {
          application_fee_percent: 5,
          // Only apply trial for NEW subscriptions, not plan changes
          ...(trialDays > 0 && !hasExistingSub
            ? { trial_period_days: trialDays }
            : {}),
          metadata: {
            metadataId,
            organizationId,
            externalUserId,
            productId,
            priceId,
            ...(sessionMetadata.existingSubscriptionId
              ? {
                  existingSubscriptionId: String(
                    sessionMetadata.existingSubscriptionId,
                  ),
                }
              : {}),
          },
        },
        ...(discounts && discounts.length > 0 ? { discounts } : {}),
        metadata: {
          metadataId,
          organizationId,
          externalUserId,
          productId,
          priceId,
          ...(sessionMetadata.existingSubscriptionId
            ? {
                existingSubscriptionId: String(
                  sessionMetadata.existingSubscriptionId,
                ),
              }
            : {}),
        },
        return_url: `${process.env.APP_URL}/embed/checkout/complete`,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
      } as any,
      { stripeAccount: stripeAccountId },
    );

    // 3. Update checkout_sessions metadata with new Stripe session info
    const existingMeta = session.metadata || {};
    await supabase
      .from('checkout_sessions')
      .update({
        metadata: {
          ...existingMeta,
          stripeCheckoutSessionId: newStripeSession.id,
          clientSecret: newStripeSession.client_secret,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    // 4. Link metadata to new Stripe Checkout Session
    await this.metadataService.linkToCheckoutSession(
      metadataId,
      newStripeSession.id,
    );

    this.logger.log(
      `Recreated Stripe Checkout Session: ${oldStripeSessionId} → ${newStripeSession.id}`,
    );

    return { clientSecret: newStripeSession.client_secret! };
  }
}
