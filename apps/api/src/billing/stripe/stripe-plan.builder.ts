import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import { BillingContext } from '../context/types';
import { BillingPlan } from '../plan/types';
import { StripePlan, StripeAction, StripeCancelAction } from './types';

type CheckoutSessionUiMode = 'embedded' | 'custom';

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
        // Plain swaps don't go through the proration-invoice flow, so they
        // don't need a checkout session ID. All other in-place updates do.
        if (!ctx.isInPlaceSwap && !ctx.existingCheckoutSessionId) {
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
          intervalChanged:
            ctx.transition!.oldSubscription.recurringInterval !==
            ctx.price.recurringInterval,
          isPlainSwap: ctx.isInPlaceSwap,
          // Both trial→trial upgrade and trialing→paid downgrade preserve the
          // remaining trial window via the old sub's currentPeriodEnd. This is
          // anti-abuse: a customer mid-trial on plan A who jumps to plan B
          // doesn't get a fresh new trial (which would chain free time
          // indefinitely across plan changes). Matches Stripe's default — an
          // `update()` with a new price doesn't introduce a trial unless you
          // explicitly request it. To offer a "fresh trial on upgrade"
          // promotion, that should be an explicit flag, not the default.
          //
          // Fallback (when currentPeriodEnd is unexpectedly missing): grant
          // the new plan's trialDays from now. If trialDays is also 0 we'd
          // bill immediately, which is unsafe — guard with a minimum 1-day
          // grace window so a misconfigured product can't auto-charge a
          // mid-trial customer.
          ...(ctx.isTrialToTrialUpgrade || ctx.isTrialingDowngrade
            ? {
                newTrialEnd: ctx.transition!.oldSubscription.currentPeriodEnd
                  ? Math.floor(
                      new Date(
                        ctx.transition!.oldSubscription.currentPeriodEnd,
                      ).getTime() / 1000,
                    )
                  : Math.floor(
                      (Date.now() +
                        Math.max(ctx.product.trialDays, 1) * 86400000) /
                        1000,
                    ),
                trialCreditAmount: 0,
              }
            : {
                isTrialUpgrade: ctx.isTrialUpgrade || undefined,
                trialCreditAmount: ctx.isTrialUpgrade
                  ? ctx.transition!.oldSubscription.amount
                  : undefined,
                trialCreditCurrency: ctx.isTrialUpgrade
                  ? ctx.price.currency
                  : undefined,
              }),
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

      // A BOS-only free sub (no stripe_subscription_id) is not a real
      // billing transition — treat the customer as new for trial / payment
      // method purposes. Only `sub_*` Stripe subs gate out the trial.
      const hasExistingSub =
        !!ctx.transition?.oldSubscription.stripeSubscriptionId?.startsWith(
          'sub_',
        );
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
        return_url: `${process.env.APP_URL}/embed/checkout/success`,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
      } as Stripe.Checkout.SessionCreateParams;

      return {
        kind: 'create_checkout_session',
        params,
      };
    }

    // Standard mode → Stripe Checkout Session.
    // - Hosted (`ui_mode: 'embedded'`): Stripe renders the form.
    // - Embedded (`ui_mode: 'custom'`): the BOS embed renders its own UI on
    //   top of `useCheckout()` / `<PaymentElement>` from
    //   `@stripe/react-stripe-js/checkout`.
    const uiMode: CheckoutSessionUiMode =
      ctx.organization.checkoutMode === 'hosted' ? 'embedded' : 'custom';

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const hasExistingSub =
      !!ctx.transition?.oldSubscription.stripeSubscriptionId?.startsWith(
        'sub_',
      );
    const hasPreAppliedDiscount = !!ctx.discount?.stripeCouponId;
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: ctx.customer.stripeCustomerId,
      line_items: [{ price: sub.stripePriceId, quantity: 1 }],
      ui_mode: uiMode,
      ...(hasPreAppliedDiscount ? {} : { allow_promotion_codes: true }),
      ...(hasExistingSub ? { payment_method_collection: 'if_required' } : {}),
      subscription_data: {
        application_fee_percent: sub.applicationFeePercent,
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
      return_url: `${process.env.APP_URL}/embed/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    } as Stripe.Checkout.SessionCreateParams;

    if (ctx.discount?.stripeCouponId) {
      return {
        kind: 'create_checkout_session',
        params,
        discounts: [{ coupon: ctx.discount.stripeCouponId }],
      };
    }

    return {
      kind: 'create_checkout_session',
      params,
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
