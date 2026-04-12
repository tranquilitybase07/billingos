import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { QueueService, PgmqMessage } from '../queue/queue.service';

@Injectable()
export class BillingCleanupService {
  private readonly logger = new Logger(BillingCleanupService.name);
  private isProcessingCheckouts = false;
  private isProcessingIncomplete = false;
  private isProcessingIdempotency = false;
  private isProcessingReconciliation = false;
  private isProcessingDriftDetection = false;
  private isProcessingRequiresAction = false;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly queueService: QueueService,
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
   * Job A2: Sweep expired requires_action checkout sessions — every 5 minutes
   *
   * In-place upgrades that hit SCA / 3DS land in `requires_action` with a
   * 30-minute grace window (`metadata.actionExpiresAt`). If the customer
   * never completes the hosted invoice flow, this sweeper:
   *   1. Voids the open Stripe invoice.
   *   2. Reverts the Stripe subscription items back to the original price.
   *   3. Marks the checkout session as `failed`.
   *
   * The BOS subscription was never mutated for `requires_action` flows, so
   * no entitlement rollback is required.
   */
  @Cron('0 */5 * * * *')
  async sweepExpiredRequiresAction() {
    if (this.isProcessingRequiresAction) {
      this.logger.log('Skipping requires_action sweep — already running');
      return;
    }

    this.isProcessingRequiresAction = true;

    try {
      const supabase = this.supabaseService.getClient();
      const now = new Date().toISOString();

      const { data: sessions, error } = await supabase
        .from('checkout_sessions')
        .select('id, stripe_invoice_id, metadata, organization_id')
        .eq('status', 'requires_action')
        .order('updated_at', { ascending: true })
        .limit(50);

      if (error) {
        this.logger.error('Error fetching requires_action sessions:', error);
        return;
      }
      if (!sessions || sessions.length === 0) return;

      const expired = sessions.filter((s) => {
        const meta = (s.metadata as Record<string, unknown>) || {};
        const expiresAt = meta.actionExpiresAt as string | undefined;
        if (!expiresAt) return false;
        return expiresAt < now;
      });

      if (expired.length === 0) return;

      this.logger.log(
        `Sweeping ${expired.length} expired requires_action sessions`,
      );

      for (const session of expired) {
        try {
          const meta = (session.metadata as Record<string, unknown>) || {};
          const stripeAccountId = meta.stripeAccountId as string | undefined;
          const existingSubscriptionId = meta.existingSubscriptionId as
            | string
            | undefined;
          const invoiceId = session.stripe_invoice_id;

          // 1. Void the proration invoice if we have one.
          if (invoiceId && stripeAccountId) {
            try {
              await this.stripeService.voidInvoice(invoiceId, stripeAccountId);
            } catch (voidError) {
              this.logger.warn(
                `Failed to void invoice ${invoiceId}:`,
                voidError,
              );
            }
          }

          // 2. Revert the Stripe subscription items.
          if (existingSubscriptionId && stripeAccountId) {
            await this.revertExpiredUpgrade(
              existingSubscriptionId,
              stripeAccountId,
            );
          }

          // 3. Flip session to failed.
          await supabase
            .from('checkout_sessions')
            .update({
              status: 'failed',
              execution_error:
                'requires_action expired before customer completed payment',
              updated_at: new Date().toISOString(),
            })
            .eq('id', session.id);
        } catch (itemError) {
          this.logger.error(
            `Failed to sweep requires_action session ${session.id}:`,
            itemError,
          );
        }
      }

      this.logger.log(
        `requires_action sweep complete: ${expired.length} processed`,
      );
    } catch (error) {
      this.logger.error('Error in requires_action sweep:', error);
    } finally {
      this.isProcessingRequiresAction = false;
    }
  }

  private async revertExpiredUpgrade(
    bosSubscriptionId: string,
    stripeAccountId: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { data: bosSub, error } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, price_id')
      .eq('id', bosSubscriptionId)
      .single();

    if (error || !bosSub?.stripe_subscription_id || !bosSub.price_id) {
      this.logger.warn(
        `Cannot revert expired upgrade: BOS sub ${bosSubscriptionId} missing fields`,
      );
      return;
    }

    const { data: priceRow } = await supabase
      .from('product_prices')
      .select('stripe_price_id')
      .eq('id', bosSub.price_id)
      .single();

    if (!priceRow?.stripe_price_id) {
      this.logger.warn(
        `Cannot revert expired upgrade: original price ${bosSub.price_id} has no stripe_price_id`,
      );
      return;
    }

    try {
      const stripeSub = await this.stripeService.getSubscription(
        bosSub.stripe_subscription_id,
        stripeAccountId,
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
        stripeAccountId,
      );

      this.logger.log(
        `Reverted Stripe sub ${bosSub.stripe_subscription_id} after requires_action expiry`,
      );
    } catch (revertError) {
      this.logger.error(
        `CRITICAL: Failed to revert Stripe sub ${bosSub.stripe_subscription_id} after requires_action expiry`,
        revertError,
      );
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
   * Uses PGMQ for atomic reads with visibility timeout.
   * Failed messages auto-reappear after VT expires. After 5 failures, escalate to alerts.
   */
  @Cron('0 */5 * * * *')
  async processReconciliationQueue() {
    if (this.isProcessingReconciliation) {
      this.logger.log('Skipping reconciliation queue — already running');
      return;
    }

    this.isProcessingReconciliation = true;

    try {
      // Read up to 50 messages with 5-minute visibility timeout
      const messages = await this.queueService.readReconciliation(50, 300);

      if (messages.length === 0) return;

      this.logger.log(
        `Processing ${messages.length} reconciliation queue items`,
      );

      for (const msg of messages) {
        try {
          // Escalate if max retries exceeded (read_ct > 5)
          if (msg.read_ct > 5) {
            await this.queueService.escalateToManualReview(
              msg,
              `Max retries exceeded (${msg.read_ct} attempts)`,
            );
            continue;
          }

          await this.processReconciliationItem(msg);
          await this.queueService.archiveReconciliation(msg.msg_id);
        } catch (error) {
          // Message becomes visible again after VT expires (auto-retry)
          this.logger.error(
            `Failed to process msg ${msg.msg_id} (type: ${msg.message.type}):`,
            error,
          );
        }
      }

      this.logger.log(
        `Reconciliation queue processing complete: ${messages.length} items`,
      );
    } catch (error) {
      this.logger.error('Error in reconciliation queue processor:', error);
    } finally {
      this.isProcessingReconciliation = false;
    }
  }

  /**
   * Job E: Detect subscription drift — daily at 4am
   * Compares active subscriptions in Stripe vs the local DB per connected account.
   * Mismatches are sent to the billing_alerts queue for human review.
   */
  @Cron('0 0 4 * * *')
  async detectSubscriptionDrift() {
    if (this.isProcessingDriftDetection) {
      this.logger.log('Skipping drift detection — already running');
      return;
    }

    this.isProcessingDriftDetection = true;

    try {
      const supabase = this.supabaseService.getClient();

      // Get all organizations with active Stripe Connect accounts
      const { data: orgs, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, accounts!inner(stripe_id, status)')
        .eq('accounts.status', 'active')
        .not('accounts.stripe_id', 'is', null);

      if (orgError || !orgs || orgs.length === 0) {
        if (orgError) {
          this.logger.error(
            'Error fetching orgs for drift detection:',
            orgError,
          );
        }
        return;
      }

      this.logger.log(
        `Running drift detection for ${orgs.length} organizations`,
      );

      let totalDrifts = 0;

      for (const org of orgs) {
        const account = org.accounts as unknown as {
          stripe_id: string;
          status: string;
        };
        if (!account?.stripe_id) continue;

        try {
          const drifts = await this.detectDriftForAccount(
            account.stripe_id,
            org.id,
            org.name || 'Unknown',
          );
          totalDrifts += drifts;

          // Rate-limit: 200ms delay between accounts
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          this.logger.error(
            `Drift detection failed for account ${account.stripe_id}:`,
            error,
          );
        }
      }

      this.logger.log(
        `Drift detection complete: ${totalDrifts} mismatches found across ${orgs.length} organizations`,
      );
    } catch (error) {
      this.logger.error('Error in drift detection:', error);
    } finally {
      this.isProcessingDriftDetection = false;
    }
  }

  private async detectDriftForAccount(
    stripeAccountId: string,
    organizationId: string,
    organizationName: string,
  ): Promise<number> {
    const supabase = this.supabaseService.getClient();
    let driftCount = 0;

    // Fetch all Stripe subscriptions for this connected account
    const stripeSubscriptions =
      await this.stripeService.listAccountSubscriptions(stripeAccountId);

    // Fetch all local DB subscriptions with stripe_subscription_id for this org
    const { data: dbSubscriptions } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, amount')
      .eq('organization_id', organizationId)
      .not('stripe_subscription_id', 'is', null);

    const dbSubMap = new Map(
      (dbSubscriptions || []).map((s) => [s.stripe_subscription_id, s]),
    );

    const stripeSubMap = new Map(stripeSubscriptions.map((s) => [s.id, s]));

    // Check for Stripe-only subs (active in Stripe, missing or canceled in DB)
    for (const stripeSub of stripeSubscriptions) {
      if (!['active', 'trialing', 'past_due'].includes(stripeSub.status)) {
        continue;
      }

      const dbSub = dbSubMap.get(stripeSub.id);

      if (!dbSub || dbSub.status === 'canceled') {
        await this.queueService.sendAlert({
          type: 'subscription_drift',
          reference_id: stripeSub.id,
          priority: 2,
          details: {
            drift_subtype: 'stripe_only',
            organization_id: organizationId,
            organization_name: organizationName,
            stripe_status: stripeSub.status,
            db_status: dbSub?.status || null,
            stripe_amount: stripeSub.items.data[0]?.price?.unit_amount || null,
            db_amount: null,
            detected_at: new Date().toISOString(),
          },
          organization_id: organizationId,
          created_by: 'drift_detection',
        });
        driftCount++;
        continue;
      }

      // Status mismatch
      const normalizedStripeStatus =
        stripeSub.status === 'trialing' ? 'trialing' : stripeSub.status;
      if (dbSub.status !== normalizedStripeStatus) {
        await this.queueService.sendAlert({
          type: 'subscription_drift',
          reference_id: stripeSub.id,
          priority: 3,
          details: {
            drift_subtype: 'status_mismatch',
            organization_id: organizationId,
            organization_name: organizationName,
            stripe_status: stripeSub.status,
            db_status: dbSub.status,
            detected_at: new Date().toISOString(),
          },
          organization_id: organizationId,
          created_by: 'drift_detection',
        });
        driftCount++;
        continue;
      }

      // Amount mismatch
      const stripeAmount = stripeSub.items.data[0]?.price?.unit_amount || 0;
      if (dbSub.amount !== null && dbSub.amount !== stripeAmount) {
        await this.queueService.sendAlert({
          type: 'subscription_drift',
          reference_id: stripeSub.id,
          priority: 4,
          details: {
            drift_subtype: 'amount_mismatch',
            organization_id: organizationId,
            organization_name: organizationName,
            stripe_amount: stripeAmount,
            db_amount: dbSub.amount,
            detected_at: new Date().toISOString(),
          },
          organization_id: organizationId,
          created_by: 'drift_detection',
        });
        driftCount++;
      }
    }

    // Check for DB-only subs (active in DB, missing or canceled in Stripe)
    for (const dbSub of dbSubscriptions || []) {
      if (!['active', 'trialing'].includes(dbSub.status)) continue;
      if (!dbSub.stripe_subscription_id) continue;

      const stripeSub = stripeSubMap.get(dbSub.stripe_subscription_id);

      if (
        !stripeSub ||
        ['canceled', 'incomplete_expired'].includes(stripeSub.status)
      ) {
        await this.queueService.sendAlert({
          type: 'subscription_drift',
          reference_id: dbSub.stripe_subscription_id,
          priority: 2,
          details: {
            drift_subtype: 'db_only',
            organization_id: organizationId,
            organization_name: organizationName,
            stripe_status: stripeSub?.status || null,
            db_status: dbSub.status,
            db_subscription_id: dbSub.id,
            detected_at: new Date().toISOString(),
          },
          organization_id: organizationId,
          created_by: 'drift_detection',
        });
        driftCount++;
      }
    }

    if (driftCount > 0) {
      this.logger.warn(
        `Found ${driftCount} drift(s) for org ${organizationName} (${organizationId})`,
      );
    }

    return driftCount;
  }

  private async processReconciliationItem(msg: PgmqMessage): Promise<void> {
    const payload = msg.message;
    const details = payload.details || {};

    switch (payload.type) {
      case 'orphaned_stripe_subscription': {
        const stripeSubId = details.stripe_subscription_id as string;
        const stripeAccountId = details.stripe_account_id as string;

        if (!stripeSubId || !stripeAccountId) {
          this.logger.warn(
            `Reconciliation msg ${msg.msg_id} missing Stripe IDs`,
          );
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
        this.logger.log(
          `Payment failure notification: ref=${payload.reference_id}, ` +
            `org=${payload.organization_id}, ` +
            `attempt: ${String(details.attempt_count || 'unknown')}`,
        );
        break;
      }

      case 'automatic_refund': {
        // Audit-only item — just archive it
        this.logger.log(
          `Automatic refund processed: ref=${payload.reference_id}`,
        );
        break;
      }

      default:
        this.logger.warn(
          `Unknown reconciliation type: ${payload.type} for msg ${msg.msg_id}`,
        );
    }
  }
}
