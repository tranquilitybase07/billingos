import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookContext, WebhookHandler } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';

/**
 * Handles payout.failed, payout.paid, and payout.updated events.
 * Currently stub/log-only handlers — will be enhanced when a payouts table exists.
 */
@Injectable()
export class PayoutHandler implements WebhookHandler, OnModuleInit {
  private readonly logger = new Logger(PayoutHandler.name);

  constructor(private readonly router: WebhookRouter) {}

  onModuleInit(): void {
    this.router.registerHandler(
      ['payout.failed', 'payout.paid', 'payout.updated'],
      this,
    );
  }

  async handle(ctx: WebhookContext): Promise<void> {
    try {
      const payout = ctx.event.data.object as Stripe.Payout;

      switch (ctx.event.type) {
        case 'payout.failed':
          this.handlePayoutFailed(payout);
          break;

        case 'payout.paid':
          this.handlePayoutPaid(payout);
          break;

        case 'payout.updated':
          this.handlePayoutUpdated(payout);
          break;

        default:
          this.logger.warn(`Unexpected event type: ${ctx.event.type}`);
      }
    } catch (error) {
      this.logger.error('Error in PayoutHandler:', error);
    }
  }

  private handlePayoutFailed(payout: Stripe.Payout): void {
    try {
      this.logger.error(
        `Payout failed: ${payout.id} for account ${payout.destination} - ${payout.failure_message || 'Unknown error'}`,
      );

      // Get account by Stripe account ID (payout.destination can be bank account ID or account ID)
      // For Connect accounts, we need to track which account this payout belongs to
      // This will be enhanced when we add a payouts table

      // For now, just log the failure
      // TODO: Create payouts table to track payout status
      this.logger.warn(
        `Payout tracking table not yet implemented. Failed payout: ${payout.id}`,
      );
    } catch (error) {
      this.logger.error('Error handling payout.failed:', error);
    }
  }

  private handlePayoutPaid(payout: Stripe.Payout): void {
    try {
      this.logger.log(
        `Payout paid: ${payout.id} for ${payout.amount} ${payout.currency}`,
      );

      // TODO: Create payouts table to track payout status
      // For now, just log successful payouts
      this.logger.warn(
        `Payout tracking table not yet implemented. Paid payout: ${payout.id}`,
      );
    } catch (error) {
      this.logger.error('Error handling payout.paid:', error);
    }
  }

  private handlePayoutUpdated(payout: Stripe.Payout): void {
    try {
      this.logger.log(
        `Payout updated: ${payout.id} - status: ${payout.status}`,
      );

      // TODO: Create payouts table to track payout status changes
      this.logger.warn(
        `Payout tracking table not yet implemented. Updated payout: ${payout.id}`,
      );
    } catch (error) {
      this.logger.error('Error handling payout.updated:', error);
    }
  }
}
