import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import { StripeService } from '../../stripe/stripe.service';
import { StripePlan, StripeResult } from './types';

/**
 * Phase 3b: Executes the StripePlan — makes actual Stripe API calls.
 *
 * Principle: Stripe first, BOS second. If Stripe fails here, nothing
 * is written to the database. If BOS fails later, webhooks reconcile.
 */
@Injectable()
export class StripePlanExecutor {
  private readonly logger = new Logger(StripePlanExecutor.name);

  constructor(private readonly stripeService: StripeService) {}

  async execute(plan: StripePlan): Promise<StripeResult> {
    const { stripeAccountId } = plan;

    // 1. Execute cancel action first (transition)
    if (plan.cancelAction) {
      await this.executeCancelAction(plan.cancelAction, stripeAccountId);
    }

    // 2. Execute primary action
    return this.executeAction(plan);
  }

  private async executeCancelAction(
    cancelAction: NonNullable<StripePlan['cancelAction']>,
    stripeAccountId: string,
  ): Promise<void> {
    const cancelAtPeriodEnd = cancelAction.kind === 'cancel_at_period_end';

    try {
      await this.stripeService.cancelSubscription(
        cancelAction.stripeSubscriptionId,
        stripeAccountId,
        cancelAtPeriodEnd,
      );
      this.logger.log(
        `Stripe subscription ${cancelAction.stripeSubscriptionId} ` +
          `${cancelAtPeriodEnd ? 'set to cancel at period end' : 'canceled immediately'}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to cancel Stripe subscription ${cancelAction.stripeSubscriptionId}:`,
        error,
      );
      // Non-fatal: webhook will reconcile
    }
  }

  private async executeAction(plan: StripePlan): Promise<StripeResult> {
    const { stripeAccountId, action } = plan;

    switch (action.kind) {
      case 'no_stripe_action':
        return { kind: 'no_stripe_result' };

      case 'create_stripe_subscription':
        return this.createSubscription(action, stripeAccountId);

      case 'create_checkout_session':
        return this.createCheckoutSession(action, stripeAccountId);

      case 'create_setup_intent':
        return this.createSetupIntent(action, stripeAccountId);

      case 'update_stripe_subscription':
        return this.updateSubscription(action, stripeAccountId);

      default: {
        const _exhaustive: never = action;
        throw new Error(
          `Unknown stripe action: ${JSON.stringify(_exhaustive)}`,
        );
      }
    }
  }

  private async createSubscription(
    action: Extract<
      StripePlan['action'],
      { kind: 'create_stripe_subscription' }
    >,
    stripeAccountId: string,
  ): Promise<StripeResult> {
    const params = { ...action.params };
    if (action.discounts && action.discounts.length > 0) {
      params.discounts = action.discounts;
    }

    let subscription: Stripe.Subscription;
    try {
      subscription = await this.stripeService.createSubscription(
        params,
        stripeAccountId,
        action.idempotencyKey,
      );
    } catch (error) {
      this.logger.error('Failed to create Stripe subscription:', error);
      throw new BadRequestException(
        'Failed to create subscription with Stripe',
      );
    }

    // Extract PaymentIntent from subscription's first invoice
    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const stripeClient = this.stripeService.getClient();
    const expandedInvoice = await stripeClient.invoices.retrieve(
      invoice.id,
      { expand: ['payments.data.payment.payment_intent'] },
      { stripeAccount: stripeAccountId },
    );

    const firstPayment = (expandedInvoice as unknown as Record<string, unknown>)
      .payments as Record<string, unknown> | undefined;
    const paymentsData =
      (firstPayment?.data as Array<Record<string, unknown>>) || [];
    const payment = paymentsData[0]?.payment as
      | Record<string, unknown>
      | undefined;
    const paymentIntent = payment?.payment_intent as
      | Stripe.PaymentIntent
      | undefined;

    if (!paymentIntent?.client_secret) {
      this.logger.error('No PaymentIntent found on subscription invoice', {
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
      });
      // Clean up: cancel the subscription
      try {
        await this.stripeService.cancelSubscription(
          subscription.id,
          stripeAccountId,
        );
      } catch (e) {
        this.logger.error('Failed to cancel orphaned subscription:', e);
      }
      throw new BadRequestException('Failed to initialize payment');
    }

    return {
      kind: 'subscription_created',
      subscription,
      paymentIntent,
      clientSecret: paymentIntent.client_secret,
      invoiceId: invoice.id,
    };
  }

  private async createCheckoutSession(
    action: Extract<StripePlan['action'], { kind: 'create_checkout_session' }>,
    stripeAccountId: string,
  ): Promise<StripeResult> {
    const params = { ...action.params };
    if (action.discounts && action.discounts.length > 0) {
      (params as Record<string, unknown>).discounts = action.discounts;
    }

    const session = await this.stripeService
      .getClient()
      .checkout.sessions.create(params as Stripe.Checkout.SessionCreateParams, {
        stripeAccount: stripeAccountId,
      });

    return {
      kind: 'checkout_session_created',
      checkoutSession: session,
      clientSecret: session.client_secret || '',
    };
  }

  private async createSetupIntent(
    action: Extract<StripePlan['action'], { kind: 'create_setup_intent' }>,
    stripeAccountId: string,
  ): Promise<StripeResult> {
    const setupIntent = await this.stripeService
      .getClient()
      .setupIntents.create(action.params, { stripeAccount: stripeAccountId });

    return {
      kind: 'setup_intent_created',
      setupIntent,
      clientSecret: setupIntent.client_secret || '',
    };
  }

  private async updateSubscription(
    action: Extract<
      StripePlan['action'],
      { kind: 'update_stripe_subscription' }
    >,
    stripeAccountId: string,
  ): Promise<StripeResult> {
    const updatedSub = await this.stripeService.updateSubscriptionPrice(
      action.stripeSubscriptionId,
      action.newStripePriceId,
      stripeAccountId,
      { prorationBehavior: action.prorationBehavior || 'create_prorations' },
    );

    return {
      kind: 'subscription_updated',
      subscription: updatedSub,
    };
  }
}
