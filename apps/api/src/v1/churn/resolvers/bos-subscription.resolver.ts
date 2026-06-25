import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseService } from '../../../supabase/supabase.service';
import { StripeService } from '../../../stripe/stripe.service';
import {
  DiscountOffer,
  DowngradeOffer,
  PauseOffer,
} from '../dto/churn-flow-config';
import {
  ChurnContext,
  DowngradeTargetView,
  SubscriptionResolver,
  SubscriptionView,
} from './subscription-resolver.interface';

@Injectable()
export class BosSubscriptionResolver implements SubscriptionResolver {
  private readonly logger = new Logger(BosSubscriptionResolver.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
  ) {}

  async getSubscription(ctx: ChurnContext): Promise<SubscriptionView> {
    const supabase = this.supabaseService.getClient();

    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select(
        `
        id,
        status,
        current_period_end,
        cancel_at_period_end,
        active_discount,
        paused_at,
        product:products ( name ),
        price:product_prices (
          price_amount,
          price_currency,
          recurring_interval
        )
      `,
      )
      .eq('id', ctx.subscriptionRef)
      .eq('organization_id', ctx.organizationId)
      .single();

    if (error || !sub) {
      throw new NotFoundException('Subscription not found');
    }

    const product = sub.product as { name?: string } | null;
    const price = sub.price as {
      price_amount?: number;
      price_currency?: string;
      recurring_interval?: string;
    } | null;

    return {
      id: sub.id,
      status: sub.status,
      planName: product?.name ?? 'Subscription',
      amount: price?.price_amount ?? 0,
      currency: price?.price_currency ?? 'usd',
      interval: price?.recurring_interval ?? 'month',
      renewalDate: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      hasActiveDiscount: sub.active_discount != null,
      isPaused: sub.paused_at != null,
    };
  }

  async applyDiscount(
    ctx: ChurnContext,
    offer: DiscountOffer,
    reasonKey: string,
  ): Promise<SubscriptionView> {
    const supabase = this.supabaseService.getClient();

    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, status')
      .eq('id', ctx.subscriptionRef)
      .eq('organization_id', ctx.organizationId)
      .single();

    if (error || !sub) {
      throw new NotFoundException('Subscription not found');
    }
    if (!sub.stripe_subscription_id) {
      throw new BadRequestException(
        'Subscription does not have a Stripe subscription ID',
      );
    }
    if (sub.status === 'canceled') {
      throw new BadRequestException('Subscription is already cancelled');
    }

    const view = await this.getSubscription(ctx);
    const couponId = this.offerCouponId(ctx.flowId, reasonKey, offer);
    await this.ensureCoupon(
      couponId,
      offer,
      view.currency,
      ctx.stripeAccountId,
    );

    await this.stripeService.applyDiscountToSubscription(
      sub.stripe_subscription_id,
      couponId,
      ctx.stripeAccountId,
      `churn-discount-${sub.id}-${couponId}`,
    );

    // Write-through the BOS discount cache from the values we just applied, so the
    // re-redemption guard is correct before the webhook lands. Webhooks reconcile.
    await supabase
      .from('subscriptions')
      .update({
        active_discount: {
          source: 'churn',
          couponId,
          percentOff: offer.percentOff ?? null,
          amountOff: offer.amountOff ?? null,
          endsAt: this.computeEndsAt(offer),
        } as never,
      })
      .eq('id', sub.id)
      .eq('organization_id', ctx.organizationId);

    this.logger.log(
      `Applied coupon ${couponId} to subscription ${sub.id} (${sub.stripe_subscription_id})`,
    );

    return this.getSubscription(ctx);
  }

  async pause(ctx: ChurnContext, offer: PauseOffer): Promise<SubscriptionView> {
    const supabase = this.supabaseService.getClient();

    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, current_period_end')
      .eq('id', ctx.subscriptionRef)
      .eq('organization_id', ctx.organizationId)
      .single();

    if (error || !sub) {
      throw new NotFoundException('Subscription not found');
    }
    if (!sub.stripe_subscription_id) {
      throw new BadRequestException(
        'Subscription does not have a Stripe subscription ID',
      );
    }
    if (sub.status === 'canceled') {
      throw new BadRequestException('Subscription is already cancelled');
    }

    const behavior = offer.behavior ?? 'void';
    const resumesAt = this.computePauseResumesAt(offer, sub.current_period_end);
    const resumeAtUnix = resumesAt
      ? Math.floor(new Date(resumesAt).getTime() / 1000)
      : undefined;

    const updated = await this.stripeService.pauseSubscription(
      sub.stripe_subscription_id,
      ctx.stripeAccountId,
      resumeAtUnix,
      behavior,
      // Encode the offer terms so a repeat pause with a different duration isn't
      // collapsed by Stripe's 24h idempotency window (when allowRepeatPause is on).
      `churn-pause-${sub.id}-${behavior}-${resumeAtUnix ?? 0}`,
    );

    // Write-through the pause state from Stripe's response (Stripe authoritative);
    // webhooks reconcile. Access stays live until the period end — pause stops
    // future invoicing, it does not revoke entitlements here.
    const stripeResumesAt = updated.pause_collection?.resumes_at
      ? new Date(updated.pause_collection.resumes_at * 1000).toISOString()
      : resumesAt;

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        paused_at: new Date().toISOString(),
        resumes_at: stripeResumesAt,
        pause_behavior: updated.pause_collection?.behavior ?? behavior,
      })
      .eq('id', sub.id)
      .eq('organization_id', ctx.organizationId);

    if (updateError) {
      this.logger.error(
        `Stripe pause succeeded but BOS update failed for ${sub.id}: ${updateError.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to update subscription after pause',
      );
    }

    this.logger.log(
      `Paused subscription ${sub.id} (${sub.stripe_subscription_id})` +
        (resumesAt ? ` until ${resumesAt}` : ' indefinitely'),
    );

    return this.getSubscription(ctx);
  }

  /**
   * Schedule an in-place plan downgrade at the current period end. No Stripe call
   * here: we write a `subscription_changes` scheduled row exactly like the billing
   * pipeline does, and the subscription-scheduler swaps the Stripe price at period
   * end (proration none, billing cycle unchanged) and swaps entitlements. The
   * customer keeps their current plan + features until then. This lights up the
   * existing dashboard/portal "pending downgrade" UI for free.
   */
  async downgrade(
    ctx: ChurnContext,
    offer: DowngradeOffer,
  ): Promise<SubscriptionView> {
    const supabase = this.supabaseService.getClient();

    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select(
        'id, stripe_subscription_id, status, amount, price_id, current_period_end',
      )
      .eq('id', ctx.subscriptionRef)
      .eq('organization_id', ctx.organizationId)
      .single();

    if (error || !sub) {
      throw new NotFoundException('Subscription not found');
    }
    if (sub.status === 'canceled') {
      throw new BadRequestException('Subscription is already cancelled');
    }
    if (!sub.stripe_subscription_id) {
      throw new BadRequestException(
        'Subscription does not have a Stripe subscription ID',
      );
    }

    const target = await this.resolveDowngradeTarget(ctx, offer);
    if (!target) {
      throw new BadRequestException(
        'No cheaper plan is available to downgrade to',
      );
    }
    if (target.priceId === sub.price_id) {
      throw new BadRequestException('Already on the target plan');
    }

    const scheduledFor = sub.current_period_end
      ? new Date(sub.current_period_end)
      : new Date();
    const nowIso = new Date().toISOString();

    // Supersede any existing scheduled downgrade (mirrors the billing pipeline's
    // BosPlanExecutor.handleScheduledDowngrade).
    await supabase
      .from('subscription_changes')
      .update({
        status: 'failed',
        failed_reason: 'Superseded by churn downgrade',
        updated_at: nowIso,
      })
      .eq('subscription_id', sub.id)
      .eq('status', 'scheduled')
      .eq('organization_id', ctx.organizationId);

    const { error: insertError } = await supabase
      .from('subscription_changes')
      .insert({
        subscription_id: sub.id,
        organization_id: ctx.organizationId,
        change_type: 'downgrade',
        status: 'scheduled',
        from_price_id: sub.price_id,
        to_price_id: target.priceId,
        from_amount: sub.amount ?? 0,
        to_amount: target.amount,
        scheduled_for: scheduledFor.toISOString(),
        metadata: { scheduledBy: 'churn_flow' } as never,
      });

    if (insertError) {
      this.logger.error(
        `Failed to schedule churn downgrade for ${sub.id}: ${insertError.message}`,
      );
      throw new InternalServerErrorException('Failed to schedule downgrade');
    }

    this.logger.log(
      `Scheduled downgrade for subscription ${sub.id} → price ${target.priceId} ` +
        `(${sub.amount ?? 0} → ${target.amount}) at ${scheduledFor.toISOString()}`,
    );

    return this.getSubscription(ctx);
  }

  /**
   * Smart target resolution: a merchant-pinned `targetPriceId` if set and valid,
   * otherwise the next-cheaper active paid price in the org. Restricted to paid
   * targets (a real plan, not free) so the subscription stays active — a downgrade
   * to free would cancel the Stripe sub, which is out of scope for the save offer.
   */
  async resolveDowngradeTarget(
    ctx: ChurnContext,
    offer: DowngradeOffer,
  ): Promise<DowngradeTargetView | null> {
    const supabase = this.supabaseService.getClient();

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('amount, price_id')
      .eq('id', ctx.subscriptionRef)
      .eq('organization_id', ctx.organizationId)
      .single();

    if (!sub) return null;

    // Current plan's amount + interval + currency. We only ever offer a like-for-
    // like cheaper plan (same interval & currency) — comparing raw price amounts
    // across intervals or currencies is meaningless.
    let currentAmount = sub.amount ?? 0;
    let currentInterval: string | null = null;
    let currentCurrency: string | null = null;
    if (sub.price_id) {
      const { data: currentPrice } = await supabase
        .from('product_prices')
        .select('price_amount, recurring_interval, price_currency')
        .eq('id', sub.price_id)
        .single();
      if (currentPrice) {
        currentAmount = currentPrice.price_amount ?? currentAmount;
        currentInterval = currentPrice.recurring_interval ?? null;
        currentCurrency = currentPrice.price_currency ?? null;
      }
    }

    // product_prices has no organization_id column — tenant scoping goes through
    // the parent product. Resolve the org's product ids first, then constrain
    // prices to them (unambiguous, no reliance on embedded-resource filters).
    const { data: orgProducts } = await supabase
      .from('products')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('is_archived', false)
      .or('version_status.is.null,version_status.eq.current');
    const orgProductIds = (orgProducts ?? []).map((p) => p.id);
    if (orgProductIds.length === 0) return null;

    const select = `
      id,
      product_id,
      price_amount,
      price_currency,
      recurring_interval,
      stripe_price_id,
      is_archived,
      amount_type,
      product:products ( name )
    `;

    const toView = (p: {
      id: string;
      product_id: string;
      price_amount: number | null;
      price_currency: string | null;
      recurring_interval: string | null;
      stripe_price_id: string | null;
      product: { name?: string } | null;
    }): DowngradeTargetView => ({
      priceId: p.id,
      productId: p.product_id,
      stripePriceId: p.stripe_price_id,
      planName: p.product?.name ?? 'Plan',
      amount: p.price_amount ?? 0,
      currency: p.price_currency ?? 'usd',
      interval: p.recurring_interval ?? 'month',
    });

    const matchesCadence = (p: {
      recurring_interval: string | null;
      price_currency: string | null;
    }): boolean =>
      (!currentInterval || p.recurring_interval === currentInterval) &&
      (!currentCurrency || p.price_currency === currentCurrency);

    // Pinned target: honor it only if still valid (in org & current version, paid,
    // fixed, cheaper, same cadence). Otherwise fall through to auto so a pin broken
    // by product versioning self-heals to the current next-cheaper plan.
    if (offer.targetPriceId) {
      const { data: price } = await supabase
        .from('product_prices')
        .select(select)
        .eq('id', offer.targetPriceId)
        .in('product_id', orgProductIds)
        .single();

      if (
        price &&
        !price.is_archived &&
        price.amount_type === 'fixed' &&
        price.stripe_price_id &&
        (price.price_amount ?? 0) > 0 &&
        (price.price_amount ?? 0) < currentAmount &&
        matchesCadence(price)
      ) {
        return toView(price as never);
      }
    }

    // Auto: highest-priced active paid plan still cheaper than the current one,
    // constrained to the same interval & currency.
    let autoQuery = supabase
      .from('product_prices')
      .select(select)
      .in('product_id', orgProductIds)
      .eq('is_archived', false)
      .eq('amount_type', 'fixed')
      .not('stripe_price_id', 'is', null)
      .gt('price_amount', 0)
      .lt('price_amount', currentAmount);
    if (currentInterval) {
      autoQuery = autoQuery.eq('recurring_interval', currentInterval);
    }
    if (currentCurrency) {
      autoQuery = autoQuery.eq('price_currency', currentCurrency);
    }
    const { data: prices } = await autoQuery
      .order('price_amount', { ascending: false })
      .limit(1);

    const best = prices?.[0];
    if (!best) return null;
    return toView(best as never);
  }

  async cancel(
    ctx: ChurnContext,
    timing: 'immediate' | 'end_of_period',
    reason?: string,
    feedback?: string,
  ): Promise<SubscriptionView> {
    const supabase = this.supabaseService.getClient();

    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, metadata')
      .eq('id', ctx.subscriptionRef)
      .eq('organization_id', ctx.organizationId)
      .single();

    if (error || !sub) {
      throw new NotFoundException('Subscription not found');
    }
    if (sub.status === 'canceled') {
      throw new BadRequestException('Subscription is already cancelled');
    }
    if (!sub.stripe_subscription_id) {
      throw new BadRequestException(
        'Subscription does not have a Stripe subscription ID',
      );
    }

    const cancelAtPeriodEnd = timing === 'end_of_period';

    await this.stripeService.cancelSubscription(
      sub.stripe_subscription_id,
      ctx.stripeAccountId,
      cancelAtPeriodEnd,
      `churn-cancel-${sub.id}-${timing}`,
    );

    const metadata = {
      ...((sub.metadata as Record<string, unknown>) ?? {}),
      ...(reason && { cancellation_reason: reason }),
      ...(feedback && { cancellation_feedback: feedback }),
    };

    // Stripe only sets canceled_at when the subscription is actually deleted, so
    // for an end-of-period cancel we record only the scheduling flag — writing
    // canceled_at/status now would create a false BOS record (Stripe is truth).
    const updateData: Record<string, unknown> = {
      cancel_at_period_end: cancelAtPeriodEnd,
      metadata,
      ...(cancelAtPeriodEnd
        ? {}
        : { canceled_at: new Date().toISOString(), status: 'canceled' }),
    };

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', sub.id)
      .eq('organization_id', ctx.organizationId);

    if (updateError) {
      this.logger.error(
        `Stripe cancel succeeded but BOS update failed for ${sub.id}: ${updateError.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to update subscription after cancellation',
      );
    }

    this.logger.log(`Cancelled subscription ${sub.id} (${timing})`);

    return this.getSubscription(ctx);
  }

  /**
   * Deterministic coupon id per (flow, reason, terms). Stable across redemptions of
   * the same offer (one Stripe coupon, no proliferation); changes if the merchant
   * edits the percent/amount/duration (the id encodes the terms).
   */
  private offerCouponId(
    flowId: string | undefined,
    reasonKey: string,
    offer: DiscountOffer,
  ): string {
    const amt =
      offer.percentOff != null ? `p${offer.percentOff}` : `a${offer.amountOff}`;
    const dur = offer.durationInMonths ? `d${offer.durationInMonths}` : 'once';
    const base = `churn_${flowId ?? 'noflow'}_${reasonKey}_${amt}_${dur}`;
    return base.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 180);
  }

  /**
   * Create the coupon with a fixed id, idempotently. If it already exists it has
   * identical terms (the id encodes them), so we reuse it.
   */
  private async ensureCoupon(
    couponId: string,
    offer: DiscountOffer,
    currency: string,
    stripeAccountId: string,
  ): Promise<void> {
    if (offer.percentOff == null && offer.amountOff == null) {
      throw new BadRequestException(
        'Discount offer must specify percentOff or amountOff',
      );
    }

    const params: Stripe.CouponCreateParams = {
      id: couponId,
      duration: offer.durationInMonths ? 'repeating' : 'once',
      name: offer.headline || 'Save offer',
      ...(offer.durationInMonths && {
        duration_in_months: offer.durationInMonths,
      }),
      ...(offer.percentOff != null && { percent_off: offer.percentOff }),
      ...(offer.amountOff != null && {
        amount_off: offer.amountOff,
        currency,
      }),
    };

    try {
      await this.stripeService.createCoupon(params, stripeAccountId);
    } catch (err) {
      const code =
        (err as { code?: string; raw?: { code?: string } })?.code ??
        (err as { raw?: { code?: string } })?.raw?.code;
      if (code !== 'resource_already_exists') {
        throw err;
      }
    }
  }

  private computeEndsAt(offer: DiscountOffer): string | null {
    if (!offer.durationInMonths) {
      return null;
    }
    const ends = new Date();
    ends.setMonth(ends.getMonth() + offer.durationInMonths);
    return ends.toISOString();
  }

  /**
   * The pause window is added on TOP of the already-paid current period: billing
   * resumes `durationInMonths` after the current period ends, not after "now".
   * Otherwise a mid-period pause is swallowed by the period the customer already
   * paid for and grants no free time. Falls back to now if the period end is
   * unknown. Returns null for an indefinite pause.
   */
  private computePauseResumesAt(
    offer: PauseOffer,
    currentPeriodEnd: string | null,
  ): string | null {
    if (!offer.durationInMonths) {
      return null;
    }
    const resumes = currentPeriodEnd ? new Date(currentPeriodEnd) : new Date();
    resumes.setMonth(resumes.getMonth() + offer.durationInMonths);
    return resumes.toISOString();
  }
}
