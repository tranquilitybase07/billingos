import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import { BillingContext } from '../context/types';
import { BillingPlan } from '../plan/types';
import { StripePlan, StripeAction, StripeCancelAction } from './types';

/**
 * Phase 3a: Converts a BillingPlan into concrete Stripe API call parameters.
 *
 * This is the only phase that knows about Stripe's API shape.
 * The executor (Phase 3b) actually makes the calls.
 */
@Injectable()
export class StripePlanBuilder {
  private readonly logger = new Logger(StripePlanBuilder.name);

  build(ctx: BillingContext, plan: BillingPlan): StripePlan {
    const stripeAccountId = ctx.organization.stripeAccountId;
    const action = this.buildAction(ctx, plan);
    const cancelAction = this.buildCancelAction(plan);

    return { stripeAccountId, action, cancelAction };
  }

  private buildAction(ctx: BillingContext, plan: BillingPlan): StripeAction {
    switch (plan.subscription.kind) {
      case 'free_activation':
      case 'schedule_downgrade':
        return { kind: 'no_stripe_action' };

      case 'update_subscription':
        if (!ctx.existingCheckoutSessionId) {
          throw new BadRequestException(
            'In-place upgrade requires an existing checkout session ID',
          );
        }
        return {
          kind: 'update_stripe_subscription',
          stripeSubscriptionId:
            ctx.transition!.oldSubscription.stripeSubscriptionId!,
          stripeCustomerId: ctx.customer.stripeCustomerId,
          newStripePriceId: plan.subscription.newStripePriceId,
          checkoutSessionId: ctx.existingCheckoutSessionId,
        };

      case 'setup_trial':
        return {
          kind: 'create_setup_intent',
          params: {
            customer: ctx.customer.stripeCustomerId,
            usage: 'off_session',
            metadata: {
              ...plan.subscription.stripeMetadata,
              ...(ctx.checkoutMetadataId
                ? { metadataId: ctx.checkoutMetadataId }
                : {}),
            },
          },
        };

      case 'create_subscription':
        return this.buildCreateAction(ctx, plan);

      default: {
        const _exhaustive: never = plan.subscription;
        throw new Error(
          `Unknown subscription action: ${JSON.stringify(_exhaustive)}`,
        );
      }
    }
  }

  private buildCreateAction(
    ctx: BillingContext,
    plan: BillingPlan,
  ): StripeAction {
    if (plan.subscription.kind !== 'create_subscription') {
      throw new Error('Expected create_subscription action');
    }

    const sub = plan.subscription;
    const metadataId = ctx.checkoutMetadataId || '';

    // Adaptive pricing → Stripe Checkout Session
    if (plan.useAdaptivePricing) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      const hasExistingSub = !!ctx.transition;
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: 'subscription',
        currency: sub.currency,
        customer: ctx.customer.stripeCustomerId,
        line_items: [{ price: sub.stripePriceId, quantity: 1 }],
        ui_mode: 'custom',
        adaptive_pricing: { enabled: true },
        ...(hasExistingSub ? { payment_method_collection: 'if_required' } : {}),
        subscription_data: {
          application_fee_percent: sub.applicationFeePercent,
          // Only apply trial for NEW subscriptions, not plan changes
          ...(ctx.product.trialDays > 0 && !hasExistingSub
            ? { trial_period_days: ctx.product.trialDays }
            : {}),
          metadata: {
            metadataId,
            ...sub.stripeMetadata,
          },
        },
        metadata: {
          metadataId,
          ...sub.stripeMetadata,
        },
        return_url: `${process.env.APP_URL}/embed/checkout/complete`,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
      } as Stripe.Checkout.SessionCreateParams;

      return {
        kind: 'create_checkout_session',
        params,
      };
    }

    // Standard → Stripe Subscription with incomplete payment
    const params: Stripe.SubscriptionCreateParams = {
      customer: ctx.customer.stripeCustomerId,
      items: [{ price: sub.stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      application_fee_percent: sub.applicationFeePercent,
      expand: ['latest_invoice'],
      metadata: {
        metadataId,
        ...sub.stripeMetadata,
      },
    };

    const idempotencyKey = `sub-create:${ctx.customer.id}:${ctx.product.id}:${Date.now()}`;

    return {
      kind: 'create_stripe_subscription',
      params,
      idempotencyKey,
    };
  }

  private buildCancelAction(plan: BillingPlan): StripeCancelAction | null {
    if (plan.transition.kind === 'no_transition') {
      return null;
    }

    if (plan.transition.kind === 'cancel_immediate') {
      if (!plan.transition.stripeSubscriptionId?.startsWith('sub_')) {
        return null; // No Stripe subscription to cancel
      }
      return {
        kind: 'cancel_immediate',
        stripeSubscriptionId: plan.transition.stripeSubscriptionId,
      };
    }

    if (plan.transition.kind === 'cancel_at_period_end') {
      if (!plan.transition.stripeSubscriptionId?.startsWith('sub_')) {
        return null;
      }
      return {
        kind: 'cancel_at_period_end',
        stripeSubscriptionId: plan.transition.stripeSubscriptionId,
      };
    }

    return null;
  }
}
