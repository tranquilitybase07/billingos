import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import Stripe from 'stripe';
import { WebhookContext, WebhookHandler } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';
import { StripeService } from '../../../stripe/stripe.service';
import { SubscriptionsService } from '../../../subscriptions/subscriptions.service';
import { RefundService } from '../../../stripe/refund.service';

/**
 * Handles charge.refunded and charge.refund.updated events.
 * For full refunds, cancels the subscription and revokes features.
 * Logs all refunds via RefundService.
 */
@Injectable()
export class ChargeRefundedHandler implements WebhookHandler, OnModuleInit {
  private readonly logger = new Logger(ChargeRefundedHandler.name);

  constructor(
    private readonly router: WebhookRouter,
    private readonly stripeService: StripeService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    private readonly refundService: RefundService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  onModuleInit(): void {
    this.router.registerHandler(
      ['charge.refunded', 'charge.refund.updated'],
      this,
    );
  }

  async handle(ctx: WebhookContext): Promise<void> {
    try {
      switch (ctx.event.type) {
        case 'charge.refunded':
          await this.handleChargeRefunded(ctx);
          break;

        case 'charge.refund.updated':
          await this.handleRefundUpdated(ctx);
          break;

        default:
          this.logger.warn(`Unexpected event type: ${ctx.event.type}`);
      }
    } catch (error) {
      this.logger.error('Error in ChargeRefundedHandler:', error);
    }
  }

  private async handleChargeRefunded(ctx: WebhookContext): Promise<void> {
    try {
      const charge = ctx.event.data.object as any;
      this.logger.log(
        `Charge refunded: ${charge.id} (refunded: ${charge.amount_refunded}/${charge.amount})`,
      );

      const supabase = ctx.supabase;
      const isFullRefund = charge.amount_refunded === charge.amount;

      // Find subscription via charge -> invoice -> subscription
      let stripeSubscriptionId: string | null = null;
      if (charge.invoice) {
        const invoiceId =
          typeof charge.invoice === 'string'
            ? charge.invoice
            : charge.invoice.id;

        // Look up the invoice to get the subscription
        const stripeAccountId = ctx.event.account || undefined;
        try {
          const invoice = (await this.stripeService
            .getClient()
            .invoices.retrieve(
              invoiceId,
              stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
            )) as any;
          stripeSubscriptionId =
            typeof invoice.subscription === 'string'
              ? invoice.subscription
              : invoice.subscription?.id || null;
        } catch (invoiceError) {
          this.logger.warn(
            `Could not retrieve invoice ${invoiceId} for refund:`,
            invoiceError,
          );
        }
      }

      // Look up our DB subscription
      let subscriptionRecord: { id: string; product_id: string } | null = null;
      if (stripeSubscriptionId) {
        const { data } = await supabase
          .from('subscriptions')
          .select('id, product_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .single();
        subscriptionRecord = data;
      }

      if (isFullRefund && subscriptionRecord) {
        // Full refund: cancel subscription and revoke features
        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
          })
          .eq('id', subscriptionRecord.id);

        await this.subscriptionsService.revokeSubscriptionFeatures(
          subscriptionRecord.id,
        );

        // Invalidate cache
        if (subscriptionRecord.product_id) {
          await this.cacheManager.del(
            `product-metrics:${subscriptionRecord.product_id}`,
          );
        }

        this.logger.log(
          `Full refund on charge ${charge.id} — subscription ${subscriptionRecord.id} canceled and features revoked`,
        );
      } else if (!isFullRefund) {
        this.logger.log(
          `Partial refund on charge ${charge.id} — logged only, no feature changes`,
        );
      }

      // Log refund via RefundService
      const latestRefund = charge.refunds?.data?.[0];
      if (latestRefund) {
        await this.refundService.logRefund({
          paymentIntentId:
            typeof charge.payment_intent === 'string'
              ? charge.payment_intent
              : charge.payment_intent?.id || charge.id,
          stripeRefundId: latestRefund.id,
          amount: latestRefund.amount,
          currency: latestRefund.currency,
          reason: isFullRefund ? 'full_refund' : 'partial_refund',
          status: latestRefund.status || 'succeeded',
          stripeAccountId: ctx.event.account || undefined,
          metadata: {
            chargeId: charge.id,
            subscriptionId: subscriptionRecord?.id,
            isFullRefund,
          },
        });
      }
    } catch (error) {
      this.logger.error('Error handling charge.refunded:', error);
    }
  }

  private async handleRefundUpdated(ctx: WebhookContext): Promise<void> {
    try {
      const refund = ctx.event.data.object as Stripe.Refund;
      this.logger.log(
        `Refund updated: ${refund.id} — status: ${refund.status}`,
      );

      const supabase = ctx.supabase;

      // Update the refund record matching stripe_refund_id
      const { error } = await supabase
        .from('refunds')
        .update({
          status: refund.status || 'unknown',
          metadata: {
            updatedAt: new Date().toISOString(),
            failureReason: refund.failure_reason,
          },
        })
        .eq('stripe_refund_id', refund.id);

      if (error) {
        this.logger.warn(
          `Could not update refund ${refund.id} in database:`,
          error,
        );
      } else {
        this.logger.log(
          `Refund ${refund.id} status updated to ${refund.status}`,
        );
      }
    } catch (error) {
      this.logger.error('Error handling charge.refund.updated:', error);
    }
  }
}
