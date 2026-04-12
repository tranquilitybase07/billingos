import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { BillingContext } from '../context/types';
import { EntitlementPlanner } from './entitlement.planner';
import { ProrationCalculator } from './proration.calculator';
import {
  BillingPlan,
  SubscriptionAction,
  TransitionAction,
  ProrationPreview,
  DiscountPlan,
} from './types';

/**
 * Phase 2: Computes a BillingPlan from BillingContext.
 *
 * Decides WHAT should happen — provider-agnostic.
 * Does not know about Stripe API params.
 */
@Injectable()
export class BillingPlanBuilder {
  private readonly logger = new Logger(BillingPlanBuilder.name);

  constructor(
    private readonly entitlementPlanner: EntitlementPlanner,
    private readonly prorationCalculator: ProrationCalculator,
  ) {}

  async build(ctx: BillingContext): Promise<BillingPlan> {
    // 1. Determine subscription action
    const subscription = this.buildSubscriptionAction(ctx);

    // 2. Determine transition action (cancel old sub)
    const transition = this.buildTransitionAction(ctx);

    // 3. Plan entitlement changes
    const entitlements = this.entitlementPlanner.plan(ctx);

    // 4. Calculate proration (in-place upgrade only)
    let proration: ProrationPreview | null = null;
    if (ctx.isInPlaceUpgrade && ctx.transition) {
      proration = await this.prorationCalculator.preview(
        ctx.transition.oldSubscription.id,
        ctx.price.stripePriceId,
        ctx.organization.stripeAccountId,
      );
    }

    // 5. Build discount plan (if discount in context)
    const discount = ctx.discount ? this.buildDiscountPlan(ctx) : null;

    // 6. Determine if payment is required
    const paymentRequired =
      subscription.kind !== 'free_activation' &&
      subscription.kind !== 'setup_trial' &&
      subscription.kind !== 'schedule_downgrade';

    return {
      subscription,
      transition,
      entitlements,
      proration,
      discount,
      useAdaptivePricing: ctx.isAdaptivePricing,
      paymentRequired,
    };
  }

  private buildSubscriptionAction(ctx: BillingContext): SubscriptionAction {
    // Free product → immediate activation
    if (ctx.isFreeProduct) {
      return { kind: 'free_activation' };
    }

    // In-place upgrade → update existing subscription (with proration)
    // Proration is handled by ProrationInvoiceService via the manual invoice
    // flow; the planner does not need to specify proration_behavior here.
    if (ctx.isInPlaceUpgrade && ctx.transition) {
      return {
        kind: 'update_subscription',
        existingBosSubId: ctx.transition.oldSubscription.id,
        newStripePriceId: ctx.price.stripePriceId,
        newAmount: ctx.price.amount,
        newProductId: ctx.product.id,
        newPriceId: ctx.price.id,
      };
    }

    // In-place downgrade → schedule for end of billing period
    if (ctx.isInPlaceDowngrade && ctx.transition) {
      return {
        kind: 'schedule_downgrade',
        existingBosSubId: ctx.transition.oldSubscription.id,
        newStripePriceId: ctx.price.stripePriceId,
        newAmount: ctx.price.amount,
        newProductId: ctx.product.id,
        newPriceId: ctx.price.id,
        scheduledFor: ctx.transition.oldPeriodEnd || new Date(),
        fromAmount: ctx.transition.oldSubscription.amount,
        fromPriceId: ctx.transition.oldSubscription.priceId,
      };
    }

    // Trial product → SetupIntent (save card, $0 upfront)
    if (ctx.isTrialEligible) {
      return {
        kind: 'setup_trial',
        stripePriceId: ctx.price.stripePriceId,
        trialDays: ctx.product.trialDays,
        amount: ctx.price.amount,
        currency: ctx.price.currency,
        stripeMetadata: {
          organizationId: ctx.organization.id,
          externalUserId: ctx.customer.externalUserId,
          productId: ctx.product.id,
          priceId: ctx.price.id,
          trialDays: String(ctx.product.trialDays),
          billingInterval: ctx.price.recurringInterval,
          billingIntervalCount: String(ctx.price.recurringIntervalCount),
          isTrialCheckout: 'true',
        },
      };
    }

    // Validate Stripe price exists
    if (!ctx.price.stripePriceId) {
      throw new BadRequestException('Product price is not linked to Stripe');
    }

    // Standard or adaptive → create subscription
    return {
      kind: 'create_subscription',
      stripePriceId: ctx.price.stripePriceId,
      amount: ctx.price.amount,
      currency: ctx.price.currency,
      applicationFeePercent: 5,
      stripeMetadata: {
        organizationId: ctx.organization.id,
        externalUserId: ctx.customer.externalUserId,
        customerId: ctx.customer.id,
        productId: ctx.product.id,
        priceId: ctx.price.id,
        ...(ctx.transition
          ? { existingSubscriptionId: ctx.transition.oldSubscription.id }
          : {}),
      },
    };
  }

  private buildTransitionAction(ctx: BillingContext): TransitionAction {
    if (!ctx.transition) {
      return { kind: 'no_transition' };
    }

    // In-place upgrade/downgrade doesn't cancel — it updates
    if (ctx.isInPlaceUpgrade || ctx.isInPlaceDowngrade) {
      return { kind: 'no_transition' };
    }

    const old = ctx.transition.oldSubscription;

    if (ctx.transition.type === 'downgrade') {
      // Trialing/past_due/already-canceling → cancel immediately
      const shouldCancelImmediately =
        old.status === 'trialing' ||
        old.status === 'past_due' ||
        old.cancelAtPeriodEnd;

      if (shouldCancelImmediately) {
        return {
          kind: 'cancel_immediate',
          subscriptionId: old.id,
          stripeSubscriptionId: old.stripeSubscriptionId,
          reason: 'downgraded',
          revokeFeatures: true,
        };
      }

      // Healthy active subscription → cancel at period end (honor paid period)
      return {
        kind: 'cancel_at_period_end',
        subscriptionId: old.id,
        stripeSubscriptionId: old.stripeSubscriptionId,
        reason: 'downgraded',
        periodEnd: ctx.transition.oldPeriodEnd || new Date(),
        revokeFeatures: false,
      };
    }

    // Upgrade or swap → cancel immediately
    return {
      kind: 'cancel_immediate',
      subscriptionId: old.id,
      stripeSubscriptionId: old.stripeSubscriptionId,
      reason: ctx.transition.type === 'upgrade' ? 'upgraded' : 'plan_swapped',
      revokeFeatures: true,
    };
  }

  private buildDiscountPlan(ctx: BillingContext): DiscountPlan {
    const d = ctx.discount!;

    if (d.type === 'percentage') {
      return {
        couponParams: {
          percent_off: d.basisPoints ?? 0,
          duration: d.duration,
          ...(d.duration === 'repeating' && d.durationInMonths
            ? { duration_in_months: d.durationInMonths }
            : {}),
        },
      };
    }

    return {
      couponParams: {
        amount_off: Math.min(d.amount ?? 0, ctx.price.amount),
        currency: d.currency || ctx.price.currency,
        duration: d.duration,
        ...(d.duration === 'repeating' && d.durationInMonths
          ? { duration_in_months: d.durationInMonths }
          : {}),
      },
    };
  }
}
