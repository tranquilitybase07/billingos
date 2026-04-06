import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookHandler, WebhookContext } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';
import { SubscriptionsService } from '../../../subscriptions/subscriptions.service';

/**
 * Handles `invoice.payment_succeeded` webhook events.
 *
 * When an invoice payment succeeds:
 * - Skips if subscription is trialing (trial uses deferred billing)
 * - Skips if already active (handled by payment_intent.succeeded)
 * - Re-grants features if recovering from past_due
 * - Updates subscription status to active
 */
@Injectable()
export class InvoicePaymentSucceededHandler
  implements WebhookHandler, OnModuleInit
{
  private readonly logger = new Logger(InvoicePaymentSucceededHandler.name);

  constructor(
    private readonly router: WebhookRouter,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  onModuleInit(): void {
    this.router.registerHandler('invoice.payment_succeeded', this);
  }

  async handle(ctx: WebhookContext): Promise<void> {
    const invoice = ctx.event.data.object as Stripe.Invoice;

    try {
      const invoiceData = invoice as any;
      if (!invoiceData.subscription) return;

      this.logger.log(
        `Invoice payment succeeded: ${invoice.id} for subscription ${invoiceData.subscription}`,
      );

      const supabase = ctx.supabase;

      // Check current subscription status before overriding
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('stripe_subscription_id', invoiceData.subscription)
        .single();

      if (!existing) {
        this.logger.warn(
          `Subscription ${invoiceData.subscription} not found in DB for invoice payment`,
        );
        return;
      }

      // Don't override trialing status -- trial subscriptions use deferred billing
      if (existing.status === 'trialing') {
        this.logger.log(
          `Subscription ${invoiceData.subscription} is trialing -- not overriding to active`,
        );
        return;
      }

      // Don't override if already active (handled by payment_intent.succeeded)
      if (existing.status === 'active') {
        this.logger.log(
          `Subscription ${invoiceData.subscription} already active -- no update needed`,
        );
        return;
      }

      // Re-grant features if recovering from past_due (features were revoked on failure)
      if (existing.status === 'past_due') {
        const { data: fullSub } = await supabase
          .from('subscriptions')
          .select(
            'id, customer_id, product_id, current_period_start, current_period_end',
          )
          .eq('stripe_subscription_id', invoiceData.subscription)
          .single();

        if (fullSub) {
          await this.subscriptionsService.grantProductFeatures(
            fullSub.customer_id,
            fullSub.id,
            fullSub.product_id,
            new Date(fullSub.current_period_start),
            new Date(fullSub.current_period_end),
          );
          this.logger.log(
            `Re-granted features for subscription ${invoiceData.subscription} after payment recovery`,
          );
        }
      }

      // Update to active for other statuses (past_due, incomplete, etc.)
      await supabase
        .from('subscriptions')
        .update({ status: 'active' })
        .eq('stripe_subscription_id', invoiceData.subscription);

      this.logger.log(
        `Subscription ${invoiceData.subscription} marked as active`,
      );
    } catch (error) {
      this.logger.error('Error handling invoice.payment_succeeded:', error);
    }
  }
}
