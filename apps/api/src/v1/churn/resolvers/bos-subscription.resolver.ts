import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseService } from '../../../supabase/supabase.service';
import { StripeService } from '../../../stripe/stripe.service';
import { DiscountOffer, PauseOffer } from '../dto/churn-flow-config';
import {
  ChurnContext,
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
    await this.ensureCoupon(couponId, offer, view.currency, ctx.stripeAccountId);

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

  async pause(
    ctx: ChurnContext,
    offer: PauseOffer,
  ): Promise<SubscriptionView> {
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
      `churn-pause-${sub.id}`,
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
      throw new Error('Failed to update subscription after pause');
    }

    this.logger.log(
      `Paused subscription ${sub.id} (${sub.stripe_subscription_id})` +
        (resumesAt ? ` until ${resumesAt}` : ' indefinitely'),
    );

    return this.getSubscription(ctx);
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

    const updateData: Record<string, unknown> = {
      cancel_at_period_end: cancelAtPeriodEnd,
      canceled_at: new Date().toISOString(),
      metadata,
    };
    if (!cancelAtPeriodEnd) {
      updateData.status = 'canceled';
    }

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', sub.id)
      .eq('organization_id', ctx.organizationId);

    if (updateError) {
      this.logger.error(
        `Stripe cancel succeeded but BOS update failed for ${sub.id}: ${updateError.message}`,
      );
      throw new Error('Failed to update subscription after cancellation');
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
