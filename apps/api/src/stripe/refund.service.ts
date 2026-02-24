import { Injectable, Logger } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { SupabaseService } from '../supabase/supabase.service';
import Stripe from 'stripe';

/**
 * Service for handling refunds - inspired by both Autum and Flowglad patterns
 * Critical for maintaining customer trust when payments succeed but service delivery fails
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Automatically refund a payment when subscription creation fails
   * This ensures customers are never charged without receiving service
   */
  async refundPaymentOnFailure(params: {
    paymentIntentId: string;
    stripeAccountId?: string;
    reason: string;
    amount?: number; // Optional: partial refund amount
  }): Promise<{ success: boolean; refundId?: string; error?: string }> {
    try {
      this.logger.warn(
        `Initiating automatic refund for payment ${params.paymentIntentId} due to: ${params.reason}`,
      );

      // Create refund in Stripe
      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: params.paymentIntentId,
        reason: 'requested_by_customer', // Stripe's reason enum
        metadata: {
          automatic_refund: 'true',
          failure_reason: params.reason,
          timestamp: new Date().toISOString(),
        },
      };

      // Add amount if partial refund requested
      if (params.amount) {
        refundParams.amount = params.amount;
      }

      const refund = await this.stripeService.getClient().refunds.create(
        refundParams,
        params.stripeAccountId ? { stripeAccount: params.stripeAccountId } : {},
      );

      // Log refund in database
      await this.logRefund({
        paymentIntentId: params.paymentIntentId,
        stripeRefundId: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        reason: params.reason,
        status: refund.status as string,
        stripeAccountId: params.stripeAccountId,
      });

      // Add to reconciliation queue for monitoring
      await this.addToReconciliationQueue({
        type: 'automatic_refund',
        referenceId: params.paymentIntentId,
        status: 'completed',
        details: {
          refundId: refund.id,
          reason: params.reason,
          amount: refund.amount,
        },
      });

      this.logger.log(
        `Refund ${refund.id} processed successfully for payment ${params.paymentIntentId}`,
      );

      return {
        success: true,
        refundId: refund.id,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process refund for payment ${params.paymentIntentId}:`,
        error,
      );

      // Add to manual reconciliation queue for critical failures
      await this.addToReconciliationQueue({
        type: 'refund_failed',
        referenceId: params.paymentIntentId,
        status: 'pending_manual_review',
        priority: 1, // Highest priority
        error: error.message,
        details: {
          paymentIntentId: params.paymentIntentId,
          reason: params.reason,
          stripeAccountId: params.stripeAccountId,
        },
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Process a manual refund request
   */
  async processManualRefund(params: {
    paymentIntentId: string;
    amount?: number;
    reason: string;
    requestedBy: string;
    stripeAccountId?: string;
  }): Promise<Stripe.Refund> {
    const refund = await this.stripeService.getClient().refunds.create(
      {
        payment_intent: params.paymentIntentId,
        amount: params.amount,
        reason: 'requested_by_customer',
        metadata: {
          manual_refund: 'true',
          requested_by: params.requestedBy,
          reason: params.reason,
          timestamp: new Date().toISOString(),
        },
      },
      params.stripeAccountId ? { stripeAccount: params.stripeAccountId } : {},
    );

    await this.logRefund({
      paymentIntentId: params.paymentIntentId,
      stripeRefundId: refund.id,
      amount: refund.amount,
      currency: refund.currency,
      reason: params.reason,
      status: refund.status as string,
      stripeAccountId: params.stripeAccountId,
      metadata: {
        requestedBy: params.requestedBy,
        manual: true,
      },
    });

    return refund;
  }

  /**
   * Log refund in database for audit trail
   */
  private async logRefund(params: {
    paymentIntentId: string;
    stripeRefundId: string;
    amount: number;
    currency: string;
    reason: string;
    status: string;
    stripeAccountId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // First check if refunds table exists (it will be created in migration)
    const { error } = await supabase.from('refunds').insert({
      payment_intent_id: params.paymentIntentId,
      stripe_refund_id: params.stripeRefundId,
      amount: params.amount,
      currency: params.currency,
      reason: params.reason,
      status: params.status,
      stripe_account_id: params.stripeAccountId,
      metadata: params.metadata || {},
      initiated_by: params.metadata?.manual ? 'manual' : 'automatic',
    });

    if (error) {
      // If table doesn't exist, log warning but don't fail
      if (error.message.includes('does not exist')) {
        this.logger.warn(
          'Refunds table does not exist yet. Run migrations to enable refund logging.',
        );
      } else {
        this.logger.error('Failed to log refund:', error);
      }
    }
  }

  /**
   * Add item to reconciliation queue for manual review
   */
  private async addToReconciliationQueue(params: {
    type: string;
    referenceId: string;
    status: string;
    priority?: number;
    error?: string;
    details?: Record<string, any>;
  }): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // Check if reconciliation_queue table exists (will be created in migration)
    const { error } = await supabase.from('reconciliation_queue').insert({
      type: params.type,
      reference_id: params.referenceId,
      status: params.status,
      priority: params.priority || 5,
      error_message: params.error,
      details: params.details || {},
    });

    if (error && !error.message.includes('does not exist')) {
      this.logger.error('Failed to add to reconciliation queue:', error);
    }
  }

  /**
   * Check refund status
   */
  async getRefundStatus(
    refundId: string,
    stripeAccountId?: string,
  ): Promise<Stripe.Refund> {
    return await this.stripeService.getClient().refunds.retrieve(
      refundId,
      stripeAccountId ? { stripeAccount: stripeAccountId } : {},
    );
  }

  /**
   * List refunds for a payment intent
   */
  async listRefundsForPayment(
    paymentIntentId: string,
    stripeAccountId?: string,
  ): Promise<Stripe.Refund[]> {
    const refunds = await this.stripeService.getClient().refunds.list(
      {
        payment_intent: paymentIntentId,
        limit: 100,
      },
      stripeAccountId ? { stripeAccount: stripeAccountId } : {},
    );

    return refunds.data;
  }
}