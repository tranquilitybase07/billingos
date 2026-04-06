import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookHandler, WebhookContext } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';

/**
 * Handles `payment_intent.payment_failed` webhook events.
 *
 * Updates the payment intent status in the database to reflect the failure.
 */
@Injectable()
export class PaymentIntentFailedHandler
  implements WebhookHandler, OnModuleInit
{
  private readonly logger = new Logger(PaymentIntentFailedHandler.name);

  constructor(private readonly router: WebhookRouter) {}

  onModuleInit(): void {
    this.router.registerHandler('payment_intent.payment_failed', this);
  }

  async handle(ctx: WebhookContext): Promise<void> {
    const paymentIntent = ctx.event.data.object as Stripe.PaymentIntent;

    try {
      this.logger.warn(`Payment intent failed: ${paymentIntent.id}`);

      const supabase = ctx.supabase;

      // Update payment intent status in database
      const { error: updateError } = await supabase
        .from('payment_intents')
        .update({
          status: paymentIntent.status,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', paymentIntent.id);

      if (updateError) {
        this.logger.error(
          `Failed to update payment intent ${paymentIntent.id}:`,
          updateError,
        );
        return;
      }

      // TODO: Send failure notification to customer
      // This could be an email, in-app notification, etc.

      this.logger.log(`Payment intent ${paymentIntent.id} marked as failed`);
    } catch (error) {
      this.logger.error(
        'Error handling payment_intent.payment_failed:',
        error,
      );
    }
  }
}
