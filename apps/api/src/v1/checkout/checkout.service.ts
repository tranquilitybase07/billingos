import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { StripeService } from '../../stripe/stripe.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { BillingService } from '../../billing/billing.service';
import { CheckoutDiscountService } from '../../billing/checkout/discount.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto';
import type { Database } from '../../../../../packages/shared/types/database';

type CheckoutSessionStatus =
  Database['public']['Enums']['checkout_session_status'];

export interface CheckoutProduct {
  name: string;
  description?: string;
  interval: string;
  intervalCount: number;
  features: string[];
}

export interface CheckoutCustomer {
  email?: string;
  name?: string;
}

export interface CheckoutSession {
  id: string;
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  totalAmount: number; // Total amount after discounts and taxes
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  expiresAt?: string;
  product: CheckoutProduct;
  customer: CheckoutCustomer;
  stripeAccountId?: string;
  trialDays?: number;
  checkoutMode?:
    | 'standard'
    | 'adaptive'
    | 'free'
    | 'trial'
    | 'upgrade'
    | 'downgrade';
  downgradeInfo?: {
    effectiveDate?: string;
    newPrice: number;
    newInterval: string;
    newIntervalCount: number;
    currency: string;
  };
  proration?: {
    credit: number;
    charge: number;
    netAmount: number;
    currency: string;
  };
  subscription?: {
    id: string;
    customerId: string;
    productId: string;
    priceId: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };
  /**
   * Set when the in-place upgrade flow has stalled at SCA / 3DS. The SDK
   * should open `actionUrl` so the customer can authenticate the proration
   * invoice. The session will transition to `completed` via the
   * `invoice.payment_succeeded` webhook.
   */
  requiresAction?: boolean;
  actionUrl?: string;
  actionType?: 'invoice_payment';
  stripeInvoiceId?: string;
}

export interface CheckoutStatus {
  sessionId: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  paymentIntentId?: string;
  subscriptionId?: string;
  customerId?: string;
  errorMessage?: string;
}

/**
 * Map the persisted `checkout_sessions.status` enum to the public
 * CheckoutSession.status field consumed by the SDK.
 */
function mapDbStatusToSession(
  status: CheckoutSessionStatus | null | undefined,
): CheckoutSession['status'] {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'awaiting_payment':
    case 'executing':
    // The SDK uses the `requiresAction` flag (not status) to drive the SCA
    // UI, so a session in `requires_action` still surfaces as `processing`.
    case 'requires_action':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'expired':
      return 'expired';
    default:
      return 'pending';
  }
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly supabaseService: SupabaseService,
    private readonly billingService: BillingService,
    private readonly discountService: CheckoutDiscountService,
  ) {}

  /**
   * Create a checkout session — Phase A (preview).
   *
   * For deferred flows (upgrade, downgrade, free) this persists a pending
   * `checkout_sessions` row with the proration preview and the original
   * request DTO. NO Stripe writes happen here. The user clicks "Confirm"
   * in the embed to trigger Phase B (execute).
   *
   * For immediate flows (standard, adaptive, trial) this runs the full
   * pipeline so the SDK can render the Stripe PaymentElement.
   */
  async createCheckout(
    organizationId: string,
    externalUserId: string,
    dto: CreateCheckoutDto,
  ): Promise<CheckoutSession> {
    return this.billingService.previewCheckout(
      organizationId,
      externalUserId,
      dto,
    );
  }

  /**
   * Execute a previously-previewed checkout — Phase B.
   *
   * Resolves the organization from the session row and delegates to
   * `BillingService.executeCheckout`, which acquires a per-customer
   * Redis lock, replays the pipeline from the persisted DTO, and runs
   * the Stripe + BOS phases.
   *
   * Idempotent on `completed`. Throws on `expired` / `awaiting_payment`.
   */
  async executeCheckout(sessionId: string): Promise<CheckoutSession> {
    const organizationId = await this.resolveOrgFromSession(sessionId);
    return this.billingService.executeCheckout(organizationId, sessionId);
  }

  /**
   * Backwards-compat wrapper. The SDK currently calls `confirm-free`
   * after the user clicks the "Activate" button on a free product.
   * Identical to `executeCheckout`.
   */
  async confirmFreeCheckout(sessionId: string): Promise<CheckoutSession> {
    return this.executeCheckout(sessionId);
  }

  /**
   * Backwards-compat wrapper. The SDK currently calls `confirm-upgrade`
   * after the user clicks the "Confirm Upgrade" button. Identical to
   * `executeCheckout`.
   */
  async confirmUpgradeCheckout(sessionId: string): Promise<CheckoutSession> {
    return this.executeCheckout(sessionId);
  }

  /**
   * Backwards-compat wrapper. The SDK currently calls `confirm-downgrade`
   * after the user clicks the "Schedule Downgrade" button. Identical to
   * `executeCheckout`.
   */
  async confirmDowngradeCheckout(sessionId: string): Promise<CheckoutSession> {
    return this.executeCheckout(sessionId);
  }

  /**
   * Confirm a Stripe PaymentIntent for an immediate (paid) flow.
   *
   * The SDK's PaymentElement calls `stripe.confirmPayment()` with the
   * `clientSecret` returned by `createCheckout`. This endpoint then
   * retrieves the PaymentIntent server-side, updates BOS state, and
   * returns the final result. Subscription creation happens via
   * webhook — we never create subscriptions here.
   */
  async confirmCheckout(
    clientSecret: string,
    dto: ConfirmCheckoutDto,
  ): Promise<{
    status: string;
    requiresAction: boolean;
    actionUrl?: string;
    success: boolean;
    subscriptionId?: string;
    message?: string;
  }> {
    try {
      // Free flows: nothing to confirm with Stripe
      if (!clientSecret || clientSecret === '') {
        return {
          status: 'succeeded',
          requiresAction: false,
          success: true,
          message: 'Free product activated successfully!',
        };
      }

      const paymentIntentId = clientSecret.split('_secret_')[0];

      const supabase = this.supabaseService.getClient();
      const { data: paymentIntentRecord } = await supabase
        .from('payment_intents')
        .select('*')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .single();

      if (!paymentIntentRecord?.stripe_account_id) {
        throw new BadRequestException('Payment intent not found or invalid');
      }

      const paymentIntent = await this.stripeService
        .getClient()
        .paymentIntents.retrieve(paymentIntentId, {
          stripeAccount: paymentIntentRecord.stripe_account_id,
        });

      this.logger.log(
        `Payment Intent ${paymentIntentId} status: ${paymentIntent.status}`,
      );

      await supabase
        .from('payment_intents')
        .update({
          status: paymentIntent.status,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', paymentIntentId);

      if (paymentIntent.status === 'succeeded') {
        // Subscription creation happens in the webhook handler.
        this.logger.log(
          `Payment succeeded for intent ${paymentIntentId}. Subscription will be created by webhook handler.`,
        );

        await supabase
          .from('checkout_sessions')
          .update({
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('payment_intent_id', paymentIntentRecord.id);

        return {
          status: 'succeeded',
          requiresAction: false,
          success: true,
          message: 'Payment successful! Your subscription is being activated.',
        };
      }

      if (
        paymentIntent.status === 'requires_action' &&
        paymentIntent.next_action?.type === 'redirect_to_url' &&
        paymentIntent.next_action.redirect_to_url?.url
      ) {
        return {
          status: 'requires_action',
          requiresAction: true,
          actionUrl: paymentIntent.next_action.redirect_to_url.url,
          success: false,
        };
      }

      return {
        status: paymentIntent.status,
        requiresAction: false,
        success: false,
      };
    } catch (error) {
      const errorDetails =
        error instanceof Error
          ? error
          : new Error(
              typeof error === 'string' ? error : 'Unknown error occurred',
            );
      const stripeErrorType =
        typeof error === 'object' &&
        error !== null &&
        'type' in error &&
        typeof error.type === 'string'
          ? error.type
          : undefined;

      this.logger.error('Failed to confirm payment:', error);
      this.logger.error('Error details:', {
        clientSecret: clientSecret.substring(0, 20) + '...',
        paymentMethodId: dto.paymentMethodId,
        errorMessage: errorDetails.message,
        errorStack: errorDetails.stack,
      });

      if (stripeErrorType === 'StripeCardError') {
        throw new BadRequestException(`Card error: ${errorDetails.message}`);
      } else if (stripeErrorType === 'StripeInvalidRequestError') {
        throw new BadRequestException(
          `Invalid request: ${errorDetails.message}`,
        );
      } else if (stripeErrorType === 'StripeAPIError') {
        throw new BadRequestException(
          'Payment service temporarily unavailable. Please try again.',
        );
      }

      throw new BadRequestException(
        `Failed to confirm payment: ${errorDetails.message}`,
      );
    }
  }

  async getCheckoutStatus(sessionId: string): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();

    const { data: session, error: sessionError } = await supabase
      .from('checkout_sessions')
      .select(
        `
        *,
        payment_intent:payment_intents(
          *,
          price:product_prices(*),
          product:products(*)
        )
      `,
      )
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new NotFoundException('Checkout session not found');
    }

    const { data: orgForCurrency } = await supabase
      .from('organizations')
      .select('default_currency')
      .eq('id', session.organization_id)
      .single();
    const orgCurrency = orgForCurrency?.default_currency || 'usd';

    const metadata = (session.metadata as any) || {};

    // Free product sessions (no payment intent)
    if (!session.payment_intent && metadata.isFreeProduct) {
      return this.getFreeCheckoutStatus(session, metadata, orgCurrency);
    }

    // Upgrade preview sessions (no payment intent)
    if (!session.payment_intent && metadata.checkoutMode === 'upgrade') {
      return this.getUpgradeCheckoutStatus(session, metadata, orgCurrency);
    }

    // Downgrade preview sessions (no payment intent)
    if (!session.payment_intent && metadata.checkoutMode === 'downgrade') {
      return this.getDowngradeCheckoutStatus(session, metadata, orgCurrency);
    }

    // Adaptive checkout sessions (no payment intent — uses Stripe Checkout Session)
    if (!session.payment_intent && metadata.checkoutMode === 'adaptive') {
      return this.getAdaptiveCheckoutStatus(session, metadata, orgCurrency);
    }

    // Trial checkout sessions (no payment intent — uses SetupIntent)
    if (!session.payment_intent && metadata.checkoutMode === 'trial') {
      return this.getTrialCheckoutStatus(session, metadata, orgCurrency);
    }

    const paymentIntent = session.payment_intent;
    if (!paymentIntent) {
      throw new NotFoundException('Payment intent not found for session');
    }

    const product = paymentIntent.product;
    const price = paymentIntent.price;
    if (!product || !price) {
      throw new NotFoundException('Product or price information not found');
    }

    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    // Look up the active subscription (if any) for the linked payment intent.
    let subscription: any = null;
    if (paymentIntent.stripe_payment_intent_id) {
      const { data: subscriptionData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('payment_intent_id', paymentIntent.id)
        .single();

      // Frontend polls until subscription is active.
      if (subscriptionData && subscriptionData.status !== 'incomplete') {
        subscription = subscriptionData;
      }
    }

    // Use the persisted state machine status as the source of truth.
    const status = mapDbStatusToSession(session.status);

    return {
      id: sessionId,
      clientSecret: paymentIntent.client_secret || '',
      paymentIntentId: paymentIntent.stripe_payment_intent_id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      totalAmount: paymentIntent.amount,
      status,
      checkoutMode: (metadata.checkoutMode ?? 'standard') as
        | 'standard'
        | 'adaptive'
        | 'free'
        | 'trial',
      expiresAt: session.expires_at,
      product: {
        name: product.name,
        interval: price.recurring_interval || 'month',
        intervalCount: price.recurring_interval_count || 1,
        features,
      },
      customer: {
        email: session.customer_email || undefined,
        name: session.customer_name || undefined,
      },
      stripeAccountId: paymentIntent.stripe_account_id || undefined,
      trialDays: product.trial_days || 0,
      subscription: subscription
        ? {
            id: subscription.id,
            customerId: subscription.customer_id,
            productId: subscription.product_id,
            priceId: subscription.price_id,
            status: subscription.status,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          }
        : undefined,
    };
  }

  /**
   * Apply a discount code to an existing checkout session.
   * Delegates to CheckoutDiscountService.
   */
  async applyDiscount(
    sessionId: string,
    code: string,
  ): Promise<{
    discountAmount: number;
    totalAmount: number;
    recurringAmount?: number;
    discountLabel: string;
    clientSecret?: string;
  }> {
    return this.discountService.apply(sessionId, code);
  }

  /**
   * Remove a previously applied discount from a checkout session.
   * Delegates to CheckoutDiscountService.
   */
  async removeDiscount(
    sessionId: string,
  ): Promise<{ totalAmount: number; clientSecret?: string }> {
    return this.discountService.remove(sessionId);
  }

  async cleanupExpiredSessions(): Promise<void> {
    const supabase = this.supabaseService.getClient();

    await supabase
      .from('checkout_sessions')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      })
      .lt('expires_at', new Date().toISOString())
      .in('status', ['pending', 'awaiting_payment']);
  }

  // ── Private helpers ──

  private async resolveOrgFromSession(sessionId: string): Promise<string> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('checkout_sessions')
      .select('organization_id')
      .eq('id', sessionId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Checkout session not found');
    }
    return data.organization_id;
  }

  // ── Status helpers for deferred-flow checkout sessions ──

  private async getFreeCheckoutStatus(
    session: any,
    metadata: any,
    orgCurrency: string,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();

    // If subscription has been created, return full data
    if (session.subscription_id) {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select(`*, product:products(*), price:product_prices(*)`)
        .eq('id', session.subscription_id)
        .single();

      if (subscription) {
        const product = subscription.product;
        const price = subscription.price;
        if (!product || !price) {
          throw new NotFoundException(
            'Product or price not found for free subscription',
          );
        }

        const { data: productFeatures } = await supabase
          .from('product_features')
          .select('features(title, properties)')
          .eq('product_id', product.id)
          .order('display_order', { ascending: true });

        const features = (productFeatures || []).map(
          (pf: any) => pf.features.title,
        );

        return {
          id: session.id,
          clientSecret: '',
          paymentIntentId: '',
          amount: 0,
          currency: price.price_currency || orgCurrency,
          totalAmount: 0,
          status: mapDbStatusToSession(session.status),
          checkoutMode: 'free',
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
          trialDays: 0,
          subscription: {
            id: subscription.id,
            customerId: subscription.customer_id,
            productId: subscription.product_id,
            priceId: subscription.price_id || '',
            status: subscription.status,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          },
        };
      }
    }

    // No subscription yet — render preview from metadata
    const productId = metadata.productId;
    const priceId = metadata.priceId;
    if (!productId || !priceId) {
      throw new BadRequestException(
        'Product or price ID missing in session metadata',
      );
    }

    const [{ data: product }, { data: price }] = await Promise.all([
      supabase.from('products').select('*').eq('id', productId).single(),
      supabase.from('product_prices').select('*').eq('id', priceId).single(),
    ]);

    if (!product || !price) {
      throw new NotFoundException('Product or price not found');
    }

    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    return {
      id: session.id,
      clientSecret: '',
      paymentIntentId: '',
      amount: 0,
      currency: price.price_currency || orgCurrency,
      totalAmount: 0,
      status: mapDbStatusToSession(session.status),
      checkoutMode: 'free',
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
      trialDays: 0,
    };
  }

  private async getUpgradeCheckoutStatus(
    session: any,
    metadata: any,
    orgCurrency: string,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();
    const productId = metadata.productId;
    const priceId = metadata.priceId;

    const [{ data: product }, { data: price }] = await Promise.all([
      supabase.from('products').select('*').eq('id', productId).single(),
      supabase.from('product_prices').select('*').eq('id', priceId).single(),
    ]);

    if (!product || !price) {
      throw new NotFoundException('Product or price not found for upgrade');
    }

    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    const prorationData = metadata.proration || {};
    const amount = metadata.newAmount || price.price_amount || 0;
    const currency = price.price_currency || orgCurrency;

    let subscription: CheckoutSession['subscription'];
    if (session.subscription_id) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', session.subscription_id)
        .single();
      if (sub) {
        subscription = {
          id: sub.id,
          customerId: sub.customer_id,
          productId: sub.product_id,
          priceId: sub.price_id || '',
          status: sub.status,
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end || false,
        };
      }
    }

    // Surface the SCA / 3DS state. The SDK polls this endpoint and uses
    // requiresAction + actionUrl to render the "complete payment" CTA.
    const requiresAction =
      session.status === 'requires_action'
        ? true
        : metadata.requiresAction === true
          ? true
          : undefined;
    const actionUrl =
      (metadata.actionUrl as string | undefined) ||
      (metadata.hostedInvoiceUrl as string | undefined);
    const actionType = metadata.actionType as 'invoice_payment' | undefined;
    const stripeInvoiceId =
      session.stripe_invoice_id ||
      (metadata.stripeInvoiceId as string | undefined) ||
      undefined;

    return {
      id: session.id,
      clientSecret: '',
      paymentIntentId: '',
      amount,
      currency,
      totalAmount: prorationData.netAmount ?? amount,
      status: mapDbStatusToSession(session.status),
      expiresAt: session.expires_at,
      checkoutMode: 'upgrade',
      proration: {
        credit: prorationData.credit ?? 0,
        charge: prorationData.charge ?? 0,
        netAmount: prorationData.netAmount ?? 0,
        currency: prorationData.currency ?? currency,
      },
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
      subscription,
      requiresAction,
      actionUrl,
      actionType,
      stripeInvoiceId,
    };
  }

  private async getDowngradeCheckoutStatus(
    session: any,
    metadata: any,
    orgCurrency: string,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();
    const productId = metadata.productId;
    const priceId = metadata.priceId;

    const [{ data: product }, { data: price }] = await Promise.all([
      supabase.from('products').select('*').eq('id', productId).single(),
      supabase.from('product_prices').select('*').eq('id', priceId).single(),
    ]);

    if (!product || !price) {
      throw new NotFoundException('Product or price not found for downgrade');
    }

    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    const amount = metadata.newAmount || price.price_amount || 0;
    const currency = price.price_currency || orgCurrency;

    let subscription: CheckoutSession['subscription'];
    if (session.subscription_id) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', session.subscription_id)
        .single();
      if (sub) {
        subscription = {
          id: sub.id,
          customerId: sub.customer_id,
          productId: sub.product_id,
          priceId: sub.price_id || '',
          status: sub.status,
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end || false,
        };
      }
    }

    return {
      id: session.id,
      clientSecret: '',
      paymentIntentId: '',
      amount,
      currency,
      totalAmount: amount,
      status: mapDbStatusToSession(session.status),
      expiresAt: session.expires_at,
      checkoutMode: 'downgrade',
      downgradeInfo: {
        effectiveDate:
          metadata.scheduledFor || metadata.effectiveDate || undefined,
        newPrice: amount,
        newInterval: price.recurring_interval || 'month',
        newIntervalCount: price.recurring_interval_count || 1,
        currency,
      },
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
      subscription,
    };
  }

  private async getTrialCheckoutStatus(
    session: any,
    metadata: any,
    orgCurrency: string,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();
    const productId = metadata.productId;
    const priceId = metadata.priceId;

    const [{ data: product }, { data: price }] = await Promise.all([
      supabase.from('products').select('*').eq('id', productId).single(),
      supabase.from('product_prices').select('*').eq('id', priceId).single(),
    ]);

    if (!product || !price) {
      throw new NotFoundException(
        'Product or price not found for trial session',
      );
    }

    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    let subscription: any = null;
    if (session.subscription_id) {
      const { data: subscriptionData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', session.subscription_id)
        .single();
      subscription = subscriptionData;
    }

    return {
      id: session.id,
      clientSecret: metadata.clientSecret || '',
      paymentIntentId: '',
      amount: metadata.priceAmount || price.price_amount || 0,
      currency: metadata.priceCurrency || price.price_currency || orgCurrency,
      totalAmount: 0,
      status: mapDbStatusToSession(session.status),
      checkoutMode: 'trial',
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

  private async getAdaptiveCheckoutStatus(
    session: any,
    metadata: any,
    orgCurrency: string,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();
    const productId = metadata.productId;
    const priceId = metadata.priceId;

    const [{ data: product }, { data: price }] = await Promise.all([
      supabase.from('products').select('*').eq('id', productId).single(),
      supabase.from('product_prices').select('*').eq('id', priceId).single(),
    ]);

    if (!product || !price) {
      throw new NotFoundException(
        'Product or price not found for adaptive session',
      );
    }

    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    let subscription: any = null;
    if (session.subscription_id) {
      const { data: subscriptionData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', session.subscription_id)
        .single();
      subscription = subscriptionData;
    }

    return {
      id: session.id,
      clientSecret: metadata.clientSecret || '',
      paymentIntentId: '',
      amount: metadata.priceAmount || price.price_amount || 0,
      currency: metadata.priceCurrency || price.price_currency || orgCurrency,
      totalAmount: metadata.priceAmount || price.price_amount || 0,
      status: mapDbStatusToSession(session.status),
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
}
