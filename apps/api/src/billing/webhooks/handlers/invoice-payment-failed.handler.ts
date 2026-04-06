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

/**
 * Handles `invoice.payment_failed` webhook events.
 *
 * When an invoice payment fails:
 * - Updates subscription status to past_due
 * - Revokes subscription features
 * - Sends a payment failure notification to the reconciliation queue
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
  ) {}

  onModuleInit(): void {
    this.router.registerHandler('invoice.payment_failed', this);
  }

  async handle(ctx: WebhookContext): Promise<void> {
    const invoice = ctx.event.data.object as Stripe.Invoice;

    try {
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
}
