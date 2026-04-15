import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseService } from '../../supabase/supabase.service';
import { StripeService } from '../../stripe/stripe.service';
import { RedisService } from '../../redis/redis.service';
import { CheckoutMetadataService } from '../../v1/checkout/checkout-metadata.service';
import { DiscountContext } from '../context/types';
import { StripeCouponParams } from '../plan/types';
import { extractPeriodStart, extractPeriodEnd } from '../utils/period-end.helper';
import type { Json } from '../../../../../packages/shared/types/database';

// ── Response types ──

export interface ApplyDiscountResult {
  discountAmount: number;
  totalAmount: number;
  recurringAmount?: number;
  discountLabel: string;
  clientSecret?: string;
}

export interface RemoveDiscountResult {
  totalAmount: number;
  clientSecret?: string;
}

// ── Internal types ──

interface SessionInfo {
  session: Record<string, unknown>;
  metadata: Record<string, unknown>;
  paymentIntent: Record<string, unknown> | null;
  checkoutMode:
    | 'standard'
    | 'adaptive'
    | 'trial'
    | 'free'
    | 'upgrade'
    | 'downgrade';
  organizationId: string;
  productId: string;
  amount: number;
  currency: string;
  stripeAccountId: string;
}

/**
 * Handles applying and removing discounts on existing checkout sessions.
 *
 * Validates discount codes, calculates amounts, creates Stripe coupons,
 * and recreates Stripe objects (subscription or checkout session) with
 * the coupon included at creation time.
 *
 * For trial sessions, the coupon is stored in metadata and applied when
 * the webhook creates the subscription.
 */
@Injectable()
export class CheckoutDiscountService {
  private readonly logger = new Logger(CheckoutDiscountService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly redisService: RedisService,
    private readonly metadataService: CheckoutMetadataService,
  ) {}

  // ── Public API ──

  /**
   * Apply a discount code to an existing checkout session.
   * Acquires a Redis lock to prevent concurrent discount operations.
   */
  async apply(sessionId: string, code: string): Promise<ApplyDiscountResult> {
    return this.withDiscountLock(sessionId, () =>
      this.applyInner(sessionId, code),
    );
  }

  /**
   * Remove a previously applied discount from a checkout session.
   * Acquires a Redis lock to prevent concurrent discount operations.
   */
  async remove(sessionId: string): Promise<RemoveDiscountResult> {
    return this.withDiscountLock(sessionId, () => this.removeInner(sessionId));
  }

  /**
   * Resolve a discount code into a DiscountContext for the billing pipeline.
   * Used by BillingContextBuilder when a couponCode is provided at checkout creation.
   */
  async resolveDiscount(
    organizationId: string,
    code: string,
    productId: string,
  ): Promise<DiscountContext> {
    const supabase = this.supabaseService.getClient();
    const discount = await this.lookupAndValidateDiscount(
      supabase,
      organizationId,
      code,
      productId,
    );

    return {
      id: discount.id as string,
      code: (discount.code as string) || code,
      type: discount.type as 'percentage' | 'fixed',
      basisPoints: (discount.basis_points as number | null) ?? undefined,
      amount: (discount.amount as number | null) ?? undefined,
      currency: (discount.currency as string | null) ?? undefined,
      duration: ((discount.duration as string) || 'once') as
        | 'once'
        | 'repeating'
        | 'forever',
      durationInMonths:
        (discount.duration_in_months as number | null) ?? undefined,
      stripeCouponId: (discount.stripe_coupon_id as string | null) ?? undefined,
      maxRedemptions: (discount.max_redemptions as number | null) ?? undefined,
      redemptionsCount:
        (discount.redemptions_count as number | null) ?? undefined,
    };
  }

  // ── Core apply/remove logic ──

  private async applyInner(
    sessionId: string,
    code: string,
  ): Promise<ApplyDiscountResult> {
    const supabase = this.supabaseService.getClient();
    const info = await this.loadSessionInfo(sessionId);

    // Validate discount
    const discount = await this.lookupAndValidateDiscount(
      supabase,
      info.organizationId,
      code,
      info.productId,
    );

    // Calculate discount amount
    const { discountAmount, discountLabel, newAmount } = this.calculateDiscount(
      discount,
      info.amount,
    );

    // Build Stripe coupon params
    const couponParams = this.buildCouponParams(
      discount,
      info.amount,
      info.currency,
    );

    // Apply discount based on checkout mode
    let stripeCouponId: string | null = null;
    let clientSecretResult: string | undefined;

    if (info.checkoutMode === 'trial') {
      // Trial: no Stripe object to update — coupon stored in metadata,
      // applied when webhook creates the subscription
      this.logger.log(
        `Trial session: discount ${code} recorded in metadata (coupon applied at subscription creation)`,
      );
    } else if (info.checkoutMode === 'adaptive') {
      const coupon = await this.createStripeCoupon(
        couponParams,
        info.stripeAccountId,
      );
      stripeCouponId = coupon.id;

      const result = await this.recreateAdaptiveSession(
        info,
        [{ coupon: coupon.id }],
        supabase,
      );
      clientSecretResult = result.clientSecret;
    } else {
      // Standard checkout
      const stripeSubscriptionId =
        (info.metadata.stripeSubscriptionId as string) ||
        (info.session.stripe_subscription_id as string);

      if (!stripeSubscriptionId) {
        throw new BadRequestException(
          'Unable to apply discount — subscription not found',
        );
      }

      const coupon = await this.createStripeCoupon(
        couponParams,
        info.stripeAccountId,
      );
      stripeCouponId = coupon.id;

      const result = await this.recreateStandardSubscription(
        info,
        stripeSubscriptionId,
        [{ coupon: coupon.id }],
        newAmount,
        supabase,
      );
      clientSecretResult = result.clientSecret;
    }

    // Update session metadata with discount info
    await this.saveDiscountMetadata(
      supabase,
      sessionId,
      {
        appliedDiscountId: discount.id,
        appliedDiscountCode: code,
        discountAmount,
        originalAmount: info.amount,
        stripeCouponId: stripeCouponId || discount.stripe_coupon_id || null,
        discountDuration: discount.duration || 'once',
        discountDurationInMonths: discount.duration_in_months || null,
      },
      clientSecretResult,
    );

    // Determine if trial product (affects totalAmount display)
    const isTrialProduct =
      info.checkoutMode === 'trial' ||
      (info.checkoutMode === 'adaptive' &&
        (await this.hasTrialDays(info.productId, supabase)));

    return {
      discountAmount,
      totalAmount: isTrialProduct ? 0 : newAmount,
      recurringAmount: isTrialProduct ? newAmount : undefined,
      discountLabel,
      clientSecret: clientSecretResult,
    };
  }

  private async removeInner(sessionId: string): Promise<RemoveDiscountResult> {
    const supabase = this.supabaseService.getClient();
    const info = await this.loadSessionInfo(sessionId);

    // Idempotent — no discount applied
    if (!info.metadata.appliedDiscountId) {
      const fallbackAmount =
        info.checkoutMode === 'adaptive' || info.checkoutMode === 'trial'
          ? ((info.metadata.priceAmount as number) ?? 0)
          : ((info.paymentIntent?.amount as number) ?? 0);
      return { totalAmount: fallbackAmount };
    }

    const originalAmount = info.metadata.originalAmount as number;
    let clientSecretResult: string | undefined;

    if (info.checkoutMode === 'trial') {
      // Trial: just clear metadata
      this.logger.log('Trial session: removing discount from metadata only');
    } else if (info.checkoutMode === 'adaptive') {
      const result = await this.recreateAdaptiveSession(
        info,
        undefined, // No discounts = remove
        supabase,
      );
      clientSecretResult = result.clientSecret;
    } else {
      // Standard checkout
      const stripeSubscriptionId =
        (info.metadata.stripeSubscriptionId as string) ||
        (info.session.stripe_subscription_id as string);
      const stripeAccountId = info.stripeAccountId;

      if (stripeSubscriptionId && stripeAccountId) {
        const result = await this.recreateStandardSubscription(
          info,
          stripeSubscriptionId,
          undefined, // No discounts
          originalAmount,
          supabase,
        );
        clientSecretResult = result.clientSecret;

        this.logger.log(
          `Removed discount via cancel+recreate: restored amount ${originalAmount}`,
        );
      }
    }

    // Clear discount metadata
    await this.clearDiscountMetadata(supabase, sessionId, clientSecretResult);

    return { totalAmount: originalAmount, clientSecret: clientSecretResult };
  }

  // ── Discount validation & calculation ──

  private async lookupAndValidateDiscount(
    supabase: ReturnType<SupabaseService['getClient']>,
    organizationId: string,
    code: string,
    productId: string,
  ): Promise<Record<string, unknown>> {
    const { data: discount } = await supabase
      .from('discounts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('code', code)
      .is('deleted_at', null)
      .maybeSingle();

    if (!discount) {
      throw new BadRequestException('Invalid or expired code');
    }

    // Check product restrictions
    const { data: productRestrictions } = await supabase
      .from('discount_products')
      .select('product_id')
      .eq('discount_id', discount.id);

    if (productRestrictions && productRestrictions.length > 0) {
      const applicableProductIds = productRestrictions.map(
        (r: { product_id: string }) => r.product_id,
      );
      if (!applicableProductIds.includes(productId)) {
        throw new BadRequestException('Code not valid for this product');
      }
    }

    // Check redemption limits
    if (
      discount.max_redemptions &&
      discount.redemptions_count >= discount.max_redemptions
    ) {
      throw new BadRequestException('Code has reached its redemption limit');
    }

    return discount as Record<string, unknown>;
  }

  private calculateDiscount(
    discount: Record<string, unknown>,
    amount: number,
  ): { discountAmount: number; discountLabel: string; newAmount: number } {
    let discountAmount: number;
    let discountLabel: string;

    if (discount.type === 'percentage') {
      const basisPoints = (discount.basis_points as number) ?? 0;
      discountAmount = Math.round((amount * basisPoints) / 100);
      discountLabel = `${basisPoints}% off`;
    } else {
      const fixedAmount = (discount.amount as number) ?? 0;
      discountAmount = Math.min(fixedAmount, amount);
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: ((discount.currency as string) || 'usd').toUpperCase(),
      }).format(fixedAmount / 100);
      discountLabel = `-${formatted}`;
    }

    return {
      discountAmount,
      discountLabel,
      newAmount: amount - discountAmount,
    };
  }

  private buildCouponParams(
    discount: Record<string, unknown>,
    amount: number,
    currency: string,
  ): StripeCouponParams {
    const duration = (discount.duration as string) || 'once';
    const durationInMonths = discount.duration_in_months as number | null;

    if (discount.type === 'percentage') {
      return {
        percent_off: (discount.basis_points as number) ?? 0,
        duration: duration as StripeCouponParams['duration'],
        ...(duration === 'repeating' && durationInMonths
          ? { duration_in_months: durationInMonths }
          : {}),
      };
    }

    return {
      amount_off: Math.min((discount.amount as number) ?? 0, amount),
      currency,
      duration: duration as StripeCouponParams['duration'],
      ...(duration === 'repeating' && durationInMonths
        ? { duration_in_months: durationInMonths }
        : {}),
    };
  }

  // ── Stripe coupon creation ──

  private async createStripeCoupon(
    params: StripeCouponParams,
    stripeAccountId: string,
  ): Promise<Stripe.Coupon> {
    return this.stripeService
      .getClient()
      .coupons.create(params as unknown as Stripe.CouponCreateParams, {
        stripeAccount: stripeAccountId,
      });
  }

  // ── Standard subscription recreation ──

  private async recreateStandardSubscription(
    info: SessionInfo,
    stripeSubscriptionId: string,
    discounts: Stripe.SubscriptionCreateParams.Discount[] | undefined,
    newAmount: number,
    supabase: ReturnType<SupabaseService['getClient']>,
  ): Promise<{ clientSecret: string }> {
    const stripeClient = this.stripeService.getClient();
    const stripeAccountId = info.stripeAccountId;
    const paymentIntentDbId = (info.paymentIntent as Record<string, unknown>)
      ?.id as string;

    // Find subscription DB record
    const { data: subscriptionRecord } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('payment_intent_id', paymentIntentDbId)
      .single();

    if (!subscriptionRecord) {
      throw new BadRequestException('Subscription record not found');
    }

    // Retrieve original subscription for customer + price info
    const originalSub = await stripeClient.subscriptions.retrieve(
      stripeSubscriptionId,
      { stripeAccount: stripeAccountId },
    );

    // 1. Cancel the current incomplete subscription
    await stripeClient.subscriptions.cancel(
      stripeSubscriptionId,
      {},
      { stripeAccount: stripeAccountId },
    );
    this.logger.log(
      `Canceled incomplete subscription ${stripeSubscriptionId} for discount recreation`,
    );

    // 2. Create new subscription with/without discounts
    const createParams: Stripe.SubscriptionCreateParams = {
      customer: originalSub.customer as string,
      items: [{ price: (originalSub.items.data[0]?.price).id }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      application_fee_percent: 5,
      expand: ['latest_invoice'],
      metadata: {
        ...(originalSub.metadata as Record<string, string>),
        subscriptionCreatedDuringCheckout: 'true',
      },
    };

    if (discounts && discounts.length > 0) {
      createParams.discounts = discounts;
    }

    const idempotencyKey = `sub-recreate:${originalSub.customer}:${stripeSubscriptionId}:${Date.now()}`;
    const newSubscription = await this.stripeService.createSubscription(
      createParams,
      stripeAccountId,
      idempotencyKey,
    );

    // 3. Retrieve invoice with expanded PaymentIntent
    const invoice = newSubscription.latest_invoice as Stripe.Invoice;
    const expandedInvoice = await stripeClient.invoices.retrieve(
      invoice.id,
      { expand: ['payments.data.payment.payment_intent'] },
      { stripeAccount: stripeAccountId },
    );

    const firstPayment = (expandedInvoice as unknown as Record<string, unknown>)
      .payments as
      | {
          data?: Array<{ payment?: { payment_intent?: Stripe.PaymentIntent } }>;
        }
      | undefined;
    const newPaymentIntent = firstPayment?.data?.[0]?.payment?.payment_intent;

    if (!newPaymentIntent?.client_secret) {
      this.logger.error(
        'No PaymentIntent found on recreated subscription invoice',
        {
          subscriptionId: newSubscription.id,
          invoiceId: invoice.id,
        },
      );
      throw new BadRequestException(
        'Failed to recreate subscription for discount',
      );
    }

    // 4. Update DB records
    const applicationFeeAmount = Math.round(newAmount * 0.05);
    const subData = newSubscription as unknown as Record<string, unknown>;

    await supabase
      .from('payment_intents')
      .update({
        stripe_payment_intent_id: newPaymentIntent.id,
        client_secret: newPaymentIntent.client_secret,
        stripe_subscription_id: newSubscription.id,
        amount: newAmount,
        application_fee_amount: applicationFeeAmount,
        status: newPaymentIntent.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentIntentDbId);

    await supabase
      .from('subscriptions')
      .update({
        stripe_subscription_id: newSubscription.id,
        amount: newAmount,
        status: newSubscription.status,
        current_period_start: extractPeriodStart(subData),
        current_period_end: extractPeriodEnd(subData),
      })
      .eq('id', subscriptionRecord.id);

    await supabase
      .from('checkout_sessions')
      .update({
        stripe_subscription_id: newSubscription.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', info.session.id as string);

    this.logger.log(
      `Recreated subscription: ${stripeSubscriptionId} → ${newSubscription.id} (amount: ${newAmount})`,
    );

    return { clientSecret: newPaymentIntent.client_secret };
  }

  // ── Adaptive session recreation ──

  private async recreateAdaptiveSession(
    info: SessionInfo,
    discounts: Array<{ coupon: string }> | undefined,
    supabase: ReturnType<SupabaseService['getClient']>,
  ): Promise<{ clientSecret: string }> {
    const stripeClient = this.stripeService.getClient();
    const session = info.session;
    const metadata = info.metadata;

    const stripeAccountId = metadata.stripeAccountId as string;
    const oldStripeSessionId = metadata.stripeCheckoutSessionId as string;
    const currency = (metadata.priceCurrency as string) ?? 'usd';
    const metadataId = metadata.metadataId as string;
    const organizationId = session.organization_id as string;
    const externalUserId = session.customer_external_id as string;
    const customerId = metadata.customerId as string;
    const priceId = metadata.priceId as string;
    const productId = metadata.productId as string;

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

    // Expire old Stripe Checkout Session
    await stripeClient.checkout.sessions.expire(
      oldStripeSessionId,
      {},
      { stripeAccount: stripeAccountId },
    );
    this.logger.log(
      `Expired Stripe Checkout Session ${oldStripeSessionId} for discount recreation`,
    );

    // Create new Stripe Checkout Session with same params +/- discounts
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const hasExistingSub = !!metadata.existingSubscriptionId;

    const newStripeSession = await stripeClient.checkout.sessions.create(
      {
        mode: 'subscription',
        currency,
        customer: stripeCustomerId,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        ui_mode: 'custom',
        adaptive_pricing: { enabled: true },
        ...(hasExistingSub ? { payment_method_collection: 'if_required' } : {}),
        subscription_data: {
          application_fee_percent: 5,
          ...(trialDays > 0 && !hasExistingSub
            ? { trial_period_days: trialDays }
            : {}),
          metadata: {
            metadataId,
            organizationId,
            externalUserId,
            productId,
            priceId,
            ...(metadata.existingSubscriptionId
              ? {
                  existingSubscriptionId: String(
                    metadata.existingSubscriptionId,
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
          ...(metadata.existingSubscriptionId
            ? {
                existingSubscriptionId: String(metadata.existingSubscriptionId),
              }
            : {}),
        },
        return_url: `${process.env.APP_URL}/embed/checkout/complete`,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
      } as unknown as Stripe.Checkout.SessionCreateParams,
      { stripeAccount: stripeAccountId },
    );

    // Update checkout_sessions metadata with new Stripe session info
    const existingMeta = session.metadata || {};
    await supabase
      .from('checkout_sessions')
      .update({
        metadata: {
          ...(existingMeta as Record<string, unknown>),
          stripeCheckoutSessionId: newStripeSession.id,
          clientSecret: newStripeSession.client_secret,
        } as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id as string);

    // Link metadata to new Stripe Checkout Session
    await this.metadataService.linkToCheckoutSession(
      metadataId,
      newStripeSession.id,
    );

    this.logger.log(
      `Recreated Stripe Checkout Session: ${oldStripeSessionId} → ${newStripeSession.id}`,
    );

    return { clientSecret: newStripeSession.client_secret! };
  }

  // ── Session helpers ──

  /**
   * Reject discount operations on deferred-flow checkouts (upgrade,
   * downgrade, free) — these don't have a Stripe object to attach a
   * coupon to at preview time. To support coupons on these flows in
   * the future, re-run `previewCheckout` with `dto.couponCode` set.
   */
  private assertNotDeferredMode(
    checkoutMode: SessionInfo['checkoutMode'],
    operation: 'apply' | 'remove' | 'discount',
  ): void {
    const deferredModes: SessionInfo['checkoutMode'][] = [
      'upgrade',
      'downgrade',
      'free',
    ];
    if (deferredModes.includes(checkoutMode)) {
      const verb =
        operation === 'apply' || operation === 'discount'
          ? 'applied to'
          : 'removed from';
      throw new BadRequestException(
        `Discounts cannot be ${verb} ${checkoutMode} checkouts.`,
      );
    }
  }

  private async loadSessionInfo(sessionId: string): Promise<SessionInfo> {
    const supabase = this.supabaseService.getClient();

    const { data: session, error } = await supabase
      .from('checkout_sessions')
      .select('*, payment_intent:payment_intents(*)')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      throw new NotFoundException('Checkout session not found');
    }

    if (session.completed_at) {
      throw new BadRequestException('Checkout session already completed');
    }

    const metadata = (session.metadata as Record<string, unknown>) || {};
    const paymentIntent = session.payment_intent as Record<
      string,
      unknown
    > | null;
    const checkoutMode = (metadata.checkoutMode as string) || 'standard';

    // Deferred flows (upgrade, downgrade, free) don't have a Stripe object
    // to attach a coupon to at preview time. Reject before any other checks
    // so callers get a clear error rather than the generic
    // "payment intent not found" message below.
    this.assertNotDeferredMode(
      checkoutMode as SessionInfo['checkoutMode'],
      'discount',
    );

    const isAdaptive = checkoutMode === 'adaptive';
    const isTrial = checkoutMode === 'trial';

    if (!paymentIntent && !isAdaptive && !isTrial) {
      throw new BadRequestException('Payment intent not found for session');
    }

    return {
      session: session as unknown as Record<string, unknown>,
      metadata,
      paymentIntent,
      checkoutMode: checkoutMode as SessionInfo['checkoutMode'],
      organizationId: session.organization_id,
      productId:
        isAdaptive || isTrial
          ? (metadata.productId as string)
          : (paymentIntent?.product_id as string),
      amount:
        isAdaptive || isTrial
          ? (metadata.priceAmount as number)
          : (paymentIntent?.amount as number),
      currency:
        isAdaptive || isTrial
          ? ((metadata.priceCurrency as string) ?? 'usd')
          : ((paymentIntent?.currency as string) ?? 'usd'),
      stripeAccountId:
        isAdaptive || isTrial
          ? (metadata.stripeAccountId as string)
          : (paymentIntent?.stripe_account_id as string),
    };
  }

  // ── Metadata persistence ──

  private async saveDiscountMetadata(
    supabase: ReturnType<SupabaseService['getClient']>,
    sessionId: string,
    discountFields: Record<string, unknown>,
    clientSecretResult: string | undefined,
  ): Promise<void> {
    // Re-fetch current metadata (recreation methods may have updated it)
    const { data: freshSession } = await supabase
      .from('checkout_sessions')
      .select('metadata, stripe_subscription_id')
      .eq('id', sessionId)
      .single();

    const existingMetadata =
      (freshSession?.metadata as Record<string, unknown>) || {};
    const newStripeSubscriptionId = clientSecretResult
      ? freshSession?.stripe_subscription_id
      : null;

    await supabase
      .from('checkout_sessions')
      .update({
        metadata: {
          ...existingMetadata,
          ...discountFields,
          ...(newStripeSubscriptionId
            ? { stripeSubscriptionId: newStripeSubscriptionId }
            : {}),
        } as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
  }

  private async clearDiscountMetadata(
    supabase: ReturnType<SupabaseService['getClient']>,
    sessionId: string,
    clientSecretResult: string | undefined,
  ): Promise<void> {
    // Re-fetch metadata (recreation methods may have updated it)
    const { data: freshSession } = await supabase
      .from('checkout_sessions')
      .select('metadata')
      .eq('id', sessionId)
      .single();

    const cleanMetadata = {
      ...((freshSession?.metadata as Record<string, unknown>) || {}),
    };
    delete cleanMetadata.appliedDiscountId;
    delete cleanMetadata.appliedDiscountCode;
    delete cleanMetadata.discountAmount;
    delete cleanMetadata.originalAmount;
    delete cleanMetadata.stripeCouponId;
    delete cleanMetadata.discountDuration;
    delete cleanMetadata.discountDurationInMonths;

    // Update stripeSubscriptionId if subscription was recreated
    if (clientSecretResult) {
      const { data: updatedSession } = await supabase
        .from('checkout_sessions')
        .select('stripe_subscription_id')
        .eq('id', sessionId)
        .single();
      if (updatedSession?.stripe_subscription_id) {
        cleanMetadata.stripeSubscriptionId =
          updatedSession.stripe_subscription_id;
      }
    }

    await supabase
      .from('checkout_sessions')
      .update({
        metadata: cleanMetadata as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
  }

  // ── Utilities ──

  private async withDiscountLock<T>(
    sessionId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const lockKey = `discount-lock:${sessionId}`;
    const acquired = await this.redisService.setIdempotencyKey(
      lockKey,
      Date.now().toString(),
      30000, // 30s TTL
    );

    if (!acquired) {
      throw new ConflictException('Another discount operation is in progress');
    }

    try {
      return await fn();
    } finally {
      await this.redisService.delete(lockKey);
    }
  }

  private async hasTrialDays(
    productId: string,
    supabase: ReturnType<SupabaseService['getClient']>,
  ): Promise<boolean> {
    const { data } = await supabase
      .from('products')
      .select('trial_days')
      .eq('id', productId)
      .single();
    return (data?.trial_days ?? 0) > 0;
  }
}
