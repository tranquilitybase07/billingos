import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class BillingCleanupService {
  private readonly logger = new Logger(BillingCleanupService.name);
  private isProcessingCheckouts = false;
  private isProcessingIncomplete = false;
  private isProcessingIdempotency = false;
  private isProcessingReconciliation = false;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Job A: Clean up expired checkout sessions — every 15 minutes
   * Cancels associated incomplete Stripe subscriptions and marks sessions as expired.
   */
  @Cron('0 */15 * * * *')
  async cleanupExpiredCheckouts() {
    if (this.isProcessingCheckouts) {
      this.logger.log('Skipping expired checkout cleanup — already running');
      return;
    }

    this.isProcessingCheckouts = true;

    try {
      const supabase = this.supabaseService.getClient();
      const now = new Date().toISOString();

      // Find expired, uncompleted checkout sessions
      const { data: expiredSessions, error } = await supabase
        .from('checkout_sessions')
        .select('id, stripe_subscription_id, organization_id, metadata')
        .lt('expires_at', now)
        .is('completed_at', null)
        .not('metadata->>expired', 'eq', 'true')
        .order('expires_at', { ascending: true })
        .limit(50);

      if (error || !expiredSessions || expiredSessions.length === 0) {
        if (error) {
          this.logger.error('Error fetching expired checkouts:', error);
        }
        return;
      }

      this.logger.log(
        `Processing ${expiredSessions.length} expired checkout sessions`,
      );

      for (const session of expiredSessions) {
        try {
          const metadata = (session.metadata as Record<string, unknown>) || {};
          const stripeAccountId = metadata.stripeAccountId as
            | string
            | undefined;
          const stripeSubId = session.stripe_subscription_id;

          // Cancel associated incomplete Stripe subscription
          if (stripeSubId && stripeAccountId) {
            try {
              await this.stripeService.cancelSubscription(
                stripeSubId,
                stripeAccountId,
              );
              this.logger.log(
                `Cancelled Stripe subscription ${stripeSubId} for expired checkout ${session.id}`,
              );
            } catch (cancelError) {
              this.logger.warn(
                `Failed to cancel Stripe subscription ${stripeSubId}:`,
                cancelError,
              );
            }
          }

          // Mark session as expired
          await supabase
            .from('checkout_sessions')
            .update({
              metadata: { ...metadata, expired: true },
              updated_at: new Date().toISOString(),
            })
            .eq('id', session.id);
        } catch (itemError) {
          this.logger.error(
            `Failed to clean up expired checkout ${session.id}:`,
            itemError,
          );
        }
      }

      this.logger.log(
        `Expired checkout cleanup complete: ${expiredSessions.length} processed`,
      );
    } catch (error) {
      this.logger.error('Error in expired checkout cleanup:', error);
    } finally {
      this.isProcessingCheckouts = false;
    }
  }

  /**
   * Job B: Clean up stale incomplete subscriptions — every hour
   * Cancels subscriptions stuck in 'incomplete' for over 24 hours.
   */
  @Cron('0 0 * * * *')
  async cleanupStaleIncompleteSubscriptions() {
    if (this.isProcessingIncomplete) {
      this.logger.log('Skipping stale incomplete cleanup — already running');
      return;
    }

    this.isProcessingIncomplete = true;

    try {
      const supabase = this.supabaseService.getClient();
      const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data: staleSubs, error } = await supabase
        .from('subscriptions')
        .select('id, stripe_subscription_id, organization_id')
        .eq('status', 'incomplete')
        .lt('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error || !staleSubs || staleSubs.length === 0) {
        if (error) {
          this.logger.error('Error fetching stale incomplete subs:', error);
        }
        return;
      }

      this.logger.log(
        `Processing ${staleSubs.length} stale incomplete subscriptions`,
      );

      for (const sub of staleSubs) {
        try {
          // Get Stripe account ID for the org
          if (sub.stripe_subscription_id) {
            const { data: org } = await supabase
              .from('organizations')
              .select('accounts!inner(stripe_id)')
              .eq('id', sub.organization_id)
              .single();

            const stripeAccountId = (org?.accounts as any)?.stripe_id;

            if (stripeAccountId) {
              try {
                await this.stripeService.cancelSubscription(
                  sub.stripe_subscription_id,
                  stripeAccountId,
                );
              } catch (cancelError) {
                this.logger.warn(
                  `Failed to cancel stale Stripe subscription ${sub.stripe_subscription_id}:`,
                  cancelError,
                );
              }
            }
          }

          // Update DB status
          await supabase
            .from('subscriptions')
            .update({
              status: 'canceled',
              canceled_at: new Date().toISOString(),
            })
            .eq('id', sub.id);

          // Revoke features
          await this.subscriptionsService.revokeSubscriptionFeatures(sub.id);

          this.logger.log(`Cleaned up stale incomplete subscription ${sub.id}`);
        } catch (itemError) {
          this.logger.error(
            `Failed to clean up stale subscription ${sub.id}:`,
            itemError,
          );
        }
      }

      this.logger.log(
        `Stale incomplete cleanup complete: ${staleSubs.length} processed`,
      );
    } catch (error) {
      this.logger.error('Error in stale incomplete cleanup:', error);
    } finally {
      this.isProcessingIncomplete = false;
    }
  }

  /**
   * Job C: Clean up expired idempotency keys — daily at 3am
   */
  @Cron('0 0 3 * * *')
  async cleanupExpiredIdempotencyKeys() {
    if (this.isProcessingIdempotency) {
      this.logger.log('Skipping idempotency key cleanup — already running');
      return;
    }

    this.isProcessingIdempotency = true;

    try {
      const supabase = this.supabaseService.getClient();
      const now = new Date().toISOString();

      const { error, count } = await supabase
        .from('idempotency_keys')
        .delete()
        .lt('expires_at', now);

      if (error) {
        this.logger.error('Error cleaning up idempotency keys:', error);
        return;
      }

      if (count && count > 0) {
        this.logger.log(`Cleaned up ${count} expired idempotency keys`);
      }
    } catch (error) {
      this.logger.error('Error in idempotency key cleanup:', error);
    } finally {
      this.isProcessingIdempotency = false;
    }
  }

  /**
   * Job D: Process reconciliation queue — every 5 minutes
   * Handles orphaned Stripe subscriptions, payment failure notifications, etc.
   */
  @Cron('0 */5 * * * *')
  async processReconciliationQueue() {
    if (this.isProcessingReconciliation) {
      this.logger.log('Skipping reconciliation queue — already running');
      return;
    }

    this.isProcessingReconciliation = true;

    try {
      const supabase = this.supabaseService.getClient();
      const now = new Date().toISOString();

      // Fetch pending items, respecting retry schedule
      const { data: items, error } = await supabase
        .from('reconciliation_queue')
        .select('*')
        .eq('status', 'pending')
        .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(50);

      if (error || !items || items.length === 0) {
        if (error) {
          this.logger.error('Error fetching reconciliation queue:', error);
        }
        return;
      }

      this.logger.log(`Processing ${items.length} reconciliation queue items`);

      for (const item of items) {
        try {
          await this.processReconciliationItem(item);

          // Mark as completed
          await supabase
            .from('reconciliation_queue')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', item.id)
            .eq('status', 'pending'); // Optimistic lock
        } catch (itemError) {
          this.logger.error(
            `Failed to process reconciliation item ${item.id}:`,
            itemError,
          );

          // Mark as failed — the calculate_next_retry() trigger handles backoff
          await supabase
            .from('reconciliation_queue')
            .update({
              status: 'failed',
              error_message:
                itemError instanceof Error
                  ? itemError.message
                  : String(itemError),
            })
            .eq('id', item.id)
            .eq('status', 'pending');
        }
      }

      this.logger.log(
        `Reconciliation queue processing complete: ${items.length} items`,
      );
    } catch (error) {
      this.logger.error('Error in reconciliation queue processor:', error);
    } finally {
      this.isProcessingReconciliation = false;
    }
  }

  private async processReconciliationItem(item: any): Promise<void> {
    const metadata = (item.metadata as Record<string, unknown>) || {};

    switch (item.type) {
      case 'orphaned_stripe_subscription': {
        const stripeSubId = metadata.stripe_subscription_id as string;
        const stripeAccountId = metadata.stripe_account_id as string;

        if (!stripeSubId || !stripeAccountId) {
          this.logger.warn(`Reconciliation item ${item.id} missing Stripe IDs`);
          return;
        }

        await this.stripeService.cancelSubscription(
          stripeSubId,
          stripeAccountId,
        );
        this.logger.log(
          `Cancelled orphaned Stripe subscription ${stripeSubId}`,
        );
        break;
      }

      case 'payment_failed_notification': {
        // Future: send merchant webhook/email notification
        this.logger.log(
          `Payment failure notification for subscription ${item.subscription_id} ` +
            `(customer: ${item.customer_id}, org: ${item.organization_id}, ` +
            `attempt: ${metadata.attempt_count || 'unknown'})`,
        );
        break;
      }

      default:
        this.logger.warn(
          `Unknown reconciliation type: ${item.type} for item ${item.id}`,
        );
    }
  }
}
