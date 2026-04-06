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
 * Handles charge.dispute.created and charge.dispute.closed events.
 * On dispute creation: immediately revokes features and queues for review.
 * On dispute closure: restores features if won, ensures cancellation if lost.
 */
@Injectable()
export class DisputeHandler implements WebhookHandler, OnModuleInit {
  private readonly logger = new Logger(DisputeHandler.name);

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
      ['charge.dispute.created', 'charge.dispute.closed'],
      this,
    );
  }

  async handle(ctx: WebhookContext): Promise<void> {
    try {
      switch (ctx.event.type) {
        case 'charge.dispute.created':
          await this.handleDisputeCreated(ctx);
          break;

        case 'charge.dispute.closed':
          await this.handleDisputeClosed(ctx);
          break;

        default:
          this.logger.warn(`Unexpected event type: ${ctx.event.type}`);
      }
    } catch (error) {
      this.logger.error('Error in DisputeHandler:', error);
    }
  }

  private async handleDisputeCreated(ctx: WebhookContext): Promise<void> {
    try {
      const dispute = ctx.event.data.object as Stripe.Dispute;
      this.logger.warn(
        `Dispute created: ${dispute.id} — reason: ${dispute.reason}, amount: ${dispute.amount}`,
      );

      const supabase = ctx.supabase;

      // Get the charge ID from the dispute
      const chargeId =
        typeof dispute.charge === 'string'
          ? dispute.charge
          : dispute.charge?.id;

      if (!chargeId) {
        this.logger.error(`Dispute ${dispute.id} has no charge ID`);
        return;
      }

      // Look up invoice from charge to find subscription
      let stripeSubscriptionId: string | null = null;
      const stripeAccountId = ctx.event.account || undefined;

      try {
        const charge = (await this.stripeService
          .getClient()
          .charges.retrieve(
            chargeId,
            stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
          )) as any;

        if (charge.invoice) {
          const invoiceId =
            typeof charge.invoice === 'string'
              ? charge.invoice
              : charge.invoice.id;

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
        }
      } catch (lookupError) {
        this.logger.warn(
          `Could not look up charge/invoice for dispute ${dispute.id}:`,
          lookupError,
        );
      }

      // Find our DB subscription
      let subscriptionRecord: {
        id: string;
        product_id: string;
        customer_id: string;
        organization_id: string;
      } | null = null;

      if (stripeSubscriptionId) {
        const { data } = await supabase
          .from('subscriptions')
          .select('id, product_id, customer_id, organization_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .single();
        subscriptionRecord = data;
      }

      if (subscriptionRecord) {
        // Immediately revoke features — safe default during dispute
        await this.subscriptionsService.revokeSubscriptionFeatures(
          subscriptionRecord.id,
        );

        // Update subscription status to past_due (not canceled — dispute may be won)
        await supabase
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('id', subscriptionRecord.id);

        // Invalidate cache
        if (subscriptionRecord.product_id) {
          await this.cacheManager.del(
            `product-metrics:${subscriptionRecord.product_id}`,
          );
        }

        // Insert into reconciliation queue
        await this.refundService.addToReconciliationQueue({
          type: 'dispute_opened',
          referenceId: subscriptionRecord.id,
          status: 'pending_manual_review',
          priority: 1,
          details: {
            disputeId: dispute.id,
            reason: dispute.reason,
            amount: dispute.amount,
            chargeId,
            customerId: subscriptionRecord.customer_id,
            organizationId: subscriptionRecord.organization_id,
          },
        });

        this.logger.warn(
          `Dispute ${dispute.id}: features revoked for subscription ${subscriptionRecord.id}, queued for review`,
        );
      } else {
        this.logger.warn(
          `Dispute ${dispute.id}: could not find matching subscription — logging only`,
        );

        // Still queue for manual review even without a matching subscription
        await this.refundService.addToReconciliationQueue({
          type: 'dispute_opened',
          referenceId: chargeId,
          status: 'pending_manual_review',
          priority: 1,
          details: {
            disputeId: dispute.id,
            reason: dispute.reason,
            amount: dispute.amount,
            chargeId,
          },
        });
      }
    } catch (error) {
      this.logger.error('Error handling charge.dispute.created:', error);
    }
  }

  private async handleDisputeClosed(ctx: WebhookContext): Promise<void> {
    try {
      const dispute = ctx.event.data.object as Stripe.Dispute;
      this.logger.log(
        `Dispute closed: ${dispute.id} — status: ${dispute.status}`,
      );

      const supabase = ctx.supabase;

      // Get the charge ID
      const chargeId =
        typeof dispute.charge === 'string'
          ? dispute.charge
          : dispute.charge?.id;

      if (!chargeId) {
        this.logger.error(`Dispute ${dispute.id} has no charge ID`);
        return;
      }

      // Find subscription via charge -> invoice -> subscription
      let stripeSubscriptionId: string | null = null;
      const stripeAccountId = ctx.event.account || undefined;

      try {
        const charge = (await this.stripeService
          .getClient()
          .charges.retrieve(
            chargeId,
            stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
          )) as any;

        if (charge.invoice) {
          const invoiceId =
            typeof charge.invoice === 'string'
              ? charge.invoice
              : charge.invoice.id;

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
        }
      } catch (lookupError) {
        this.logger.warn(
          `Could not look up charge/invoice for dispute ${dispute.id}:`,
          lookupError,
        );
      }

      let subscriptionRecord: {
        id: string;
        product_id: string;
        customer_id: string;
      } | null = null;

      if (stripeSubscriptionId) {
        const { data } = await supabase
          .from('subscriptions')
          .select('id, product_id, customer_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .single();
        subscriptionRecord = data;
      }

      if (!subscriptionRecord) {
        this.logger.warn(
          `Dispute ${dispute.id} closed but no matching subscription found`,
        );
        return;
      }

      if (dispute.status === 'won') {
        // Merchant won the dispute — restore features
        const { data: sub } = await supabase
          .from('subscriptions')
          .select(
            'id, customer_id, product_id, current_period_start, current_period_end',
          )
          .eq('id', subscriptionRecord.id)
          .single();

        if (sub) {
          await this.subscriptionsService.grantProductFeatures(
            sub.customer_id,
            sub.id,
            sub.product_id,
            new Date(sub.current_period_start),
            new Date(sub.current_period_end),
          );

          await supabase
            .from('subscriptions')
            .update({ status: 'active' })
            .eq('id', subscriptionRecord.id);

          this.logger.log(
            `Dispute ${dispute.id} won — features restored for subscription ${subscriptionRecord.id}`,
          );
        }
      } else if (dispute.status === 'lost') {
        // Merchant lost — ensure subscription is canceled and features revoked
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

        this.logger.warn(
          `Dispute ${dispute.id} lost — subscription ${subscriptionRecord.id} canceled`,
        );
      }

      // Log dispute resolution (original alert will be resolved from admin dashboard)
      this.logger.log(
        `Dispute ${dispute.id} closed with outcome: ${dispute.status} for subscription ${subscriptionRecord.id}`,
      );
    } catch (error) {
      this.logger.error('Error handling charge.dispute.closed:', error);
    }
  }
}
