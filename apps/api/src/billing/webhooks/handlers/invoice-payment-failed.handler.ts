import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  OnModuleInit,
} from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookHandler, WebhookContext } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';
import { SubscriptionsService } from '../../../subscriptions/subscriptions.service';
import { QueueService } from '../../../queue/queue.service';
import { StripeService } from '../../../stripe/stripe.service';

/**
 * Handles `invoice.payment_failed` webhook events.
 *
 * When an invoice payment fails:
 * - If this is a deferred proration invoice (in-place upgrade with SCA),
 *   roll back the Stripe subscription items to the old price and mark the
 *   checkout session as failed. The BOS subscription was never mutated.
 * - Otherwise, the standard recovery path:
 *   - Updates subscription status to past_due
 *   - Revokes subscription features
 *   - Sends a payment failure notification to the reconciliation queue
 */
@Injectable()
export class InvoicePaymentFailedHandler
  implements WebhookHandler, OnModuleInit
{
  private readonly logger = new Logger(InvoicePaymentFailedHandler.name);

  constructor(
    private readonly router: WebhookRouter,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    private readonly queueService: QueueService,
    private readonly stripeService: StripeService,
  ) {}

  onModuleInit(): void {
    this.router.registerHandler('invoice.payment_failed', this);
  }

  async handle(ctx: WebhookContext): Promise<void> {
    const invoice = ctx.event.data.object as Stripe.Invoice;

    try {
      // Branch 1: deferred proration invoice from an in-place upgrade.
      const bosSessionId = invoice.metadata?.bosCheckoutSessionId;
      const isProrationInvoice =
        invoice.metadata?.bosProrationInvoice === 'true';
      if (bosSessionId && isProrationInvoice) {
        await this.rollbackFailedUpgrade(ctx, invoice, bosSessionId);
        return;
      }

      const invoiceData = invoice as any;
      if (!invoiceData.subscription) return;

      this.logger.warn(
        `Invoice payment failed: ${invoice.id} for subscription ${invoiceData.subscription}`,
      );

      const supabase = ctx.supabase;

      // Update subscription status to past_due
      const { data: pastDueSub } = await supabase
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('stripe_subscription_id', invoiceData.subscription)
        .select('id, customer_id, organization_id')
        .single();

      this.logger.log(
        `Subscription ${invoiceData.subscription} marked as past_due`,
      );

      // Revoke features on payment failure
      if (pastDueSub) {
        await this.subscriptionsService.revokeSubscriptionFeatures(
          pastDueSub.id,
        );

        // Send payment failure notification to reconciliation queue
        await this.queueService.sendReconciliation({
          type: 'payment_failed_notification',
          reference_id: pastDueSub.id,
          priority: 3,
          details: {
            subscription_id: pastDueSub.id,
            customer_id: pastDueSub.customer_id,
            invoice_id: invoice.id,
            attempt_count: invoiceData.attempt_count || 1,
          },
          organization_id: pastDueSub.organization_id,
          created_by: 'stripe-webhook.service',
        });
      }
    } catch (error) {
      this.logger.error('Error handling invoice.payment_failed:', error);
    }
  }

  /**
   * Roll back a deferred in-place upgrade after the proration invoice fails
   * payment (e.g. customer abandoned 3DS, card declined on the hosted page).
   *
   * The BOS subscription was never mutated for `requires_action` flows, so we
   * only need to:
   *   1. Revert the Stripe subscription items back to the old price.
   *   2. Mark the checkout session as failed.
   */
  private async rollbackFailedUpgrade(
    ctx: WebhookContext,
    invoice: Stripe.Invoice,
    bosSessionId: string,
  ): Promise<void> {
    const supabase = ctx.supabase;

    const { data: session, error: sessionError } = await supabase
      .from('checkout_sessions')
      .select('id, status, metadata')
      .eq('id', bosSessionId)
      .single();

    if (sessionError || !session) {
      this.logger.warn(
        `Failed proration invoice ${invoice.id}: session ${bosSessionId} not found`,
      );
      return;
    }

    if (session.status !== 'requires_action') {
      this.logger.warn(
        `Failed proration invoice ${invoice.id}: session ${bosSessionId} is in unexpected status ${session.status}; skipping rollback`,
      );
      return;
    }

    const metadata = (session.metadata as Record<string, unknown>) || {};
    const existingSubscriptionId = metadata.existingSubscriptionId as
      | string
      | undefined;

    if (!existingSubscriptionId) {
      this.logger.error(
        `Failed proration invoice ${invoice.id}: session ${bosSessionId} missing existingSubscriptionId metadata`,
      );
      await this.markSessionFailed(ctx, bosSessionId, invoice.id);
      return;
    }

    // Load the BOS subscription so we can resolve the original Stripe price.
    const { data: bosSub, error: bosSubError } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, price_id')
      .eq('id', existingSubscriptionId)
      .single();

    if (bosSubError || !bosSub) {
      this.logger.error(
        `Failed proration invoice ${invoice.id}: BOS sub ${existingSubscriptionId} not found`,
      );
      await this.markSessionFailed(ctx, bosSessionId, invoice.id);
      return;
    }

    if (!bosSub.stripe_subscription_id || !bosSub.price_id) {
      this.logger.error(
        `Failed proration invoice ${invoice.id}: BOS sub ${existingSubscriptionId} missing stripe_subscription_id or price_id`,
      );
      await this.markSessionFailed(ctx, bosSessionId, invoice.id);
      return;
    }

    // Look up the original Stripe price ID from product_prices.
    const { data: priceRow } = await supabase
      .from('product_prices')
      .select('stripe_price_id')
      .eq('id', bosSub.price_id)
      .single();

    if (!priceRow?.stripe_price_id) {
      this.logger.error(
        `Failed proration invoice ${invoice.id}: original price ${bosSub.price_id} has no stripe_price_id`,
      );
      await this.markSessionFailed(ctx, bosSessionId, invoice.id);
      return;
    }

    if (!ctx.stripeAccountId) {
      this.logger.error(
        `Failed proration invoice ${invoice.id}: webhook context missing stripeAccountId; cannot rollback`,
      );
      await this.markSessionFailed(ctx, bosSessionId, invoice.id);
      return;
    }

    // Revert the Stripe subscription to the old price. We need the current
    // item ID, so re-fetch the subscription first.
    try {
      const stripeSub = await this.stripeService.getSubscription(
        bosSub.stripe_subscription_id,
        ctx.stripeAccountId,
      );
      const itemId = stripeSub.items?.data?.[0]?.id;
      if (!itemId) {
        throw new Error('Stripe subscription has no items to revert');
      }

      await this.stripeService.updateSubscriptionWithParams(
        bosSub.stripe_subscription_id,
        {
          items: [{ id: itemId, price: priceRow.stripe_price_id }],
          proration_behavior: 'none',
          billing_cycle_anchor: 'unchanged',
        },
        ctx.stripeAccountId,
      );

      this.logger.log(
        `Rolled back Stripe sub ${bosSub.stripe_subscription_id} to price ${priceRow.stripe_price_id} after failed proration invoice ${invoice.id}`,
      );
    } catch (revertError) {
      this.logger.error(
        `CRITICAL: Failed to revert Stripe sub ${bosSub.stripe_subscription_id} after failed proration invoice ${invoice.id}`,
        revertError,
      );
      // Queue a reconciliation task so ops can intervene.
      await this.queueService
        .sendReconciliation({
          type: 'failed_upgrade_rollback',
          reference_id: bosSub.stripe_subscription_id,
          priority: 1,
          details: {
            stripe_subscription_id: bosSub.stripe_subscription_id,
            target_stripe_price_id: priceRow.stripe_price_id,
            invoice_id: invoice.id,
            checkout_session_id: bosSessionId,
          },
          created_by: 'invoice-payment-failed.handler',
        })
        .catch(() => undefined);
    }

    await this.markSessionFailed(ctx, bosSessionId, invoice.id);
  }

  private async markSessionFailed(
    ctx: WebhookContext,
    bosSessionId: string,
    invoiceId: string | null,
  ): Promise<void> {
    const supabase = ctx.supabase;
    const now = new Date().toISOString();
    await supabase
      .from('checkout_sessions')
      .update({
        status: 'failed',
        execution_error: `Proration invoice ${invoiceId ?? '(unknown)'} payment failed`,
        updated_at: now,
      })
      .eq('id', bosSessionId);
  }
}
