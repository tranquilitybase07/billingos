import { Logger } from '@nestjs/common';
import Stripe from 'stripe';
import {
  WebhookContext,
  WebhookTask,
  SubscriptionUpdatedData,
} from '../webhook.types';

/**
 * Sync subscription status from Stripe to BOS database.
 *
 * Reads the authoritative Stripe subscription state and writes
 * status, period dates, and cancel_at_period_end into the
 * subscriptions table.
 */
export class SyncStatusTask implements WebhookTask<SubscriptionUpdatedData> {
  readonly name = 'SyncStatus';
  private readonly logger = new Logger(SyncStatusTask.name);

  async execute(
    ctx: WebhookContext,
    data: SubscriptionUpdatedData,
  ): Promise<void> {
    const { existing, stripeSub } = data;

    const subData = stripeSub as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
    };

    const newPeriodStart = subData.current_period_start
      ? new Date(subData.current_period_start * 1000)
      : null;
    const newPeriodEnd = subData.current_period_end
      ? new Date(subData.current_period_end * 1000)
      : null;

    const updateData: Record<string, unknown> = {
      status: stripeSub.status,
      cancel_at_period_end: stripeSub.cancel_at_period_end,
    };

    if (newPeriodStart) {
      updateData.current_period_start = newPeriodStart.toISOString();
    }

    if (newPeriodEnd) {
      updateData.current_period_end = newPeriodEnd.toISOString();
    }

    if (stripeSub.canceled_at) {
      updateData.canceled_at = new Date(
        stripeSub.canceled_at * 1000,
      ).toISOString();
    }

    // Reconcile pause_collection into the BOS pause cache (read source for the
    // churn re-pause guard; Stripe is authoritative). Handles both pause and
    // resume — when Stripe clears pause_collection the cache is cleared.
    const pause = stripeSub.pause_collection;
    if (pause) {
      updateData.resumes_at = pause.resumes_at
        ? new Date(pause.resumes_at * 1000).toISOString()
        : null;
      updateData.pause_behavior = pause.behavior;
      // Stamp paused_at only on the transition into paused, so later updates
      // (e.g. renewals while paused) don't keep resetting it. `existing` carries
      // the pre-webhook value, so no extra query is needed.
      if (!existing.paused_at) {
        updateData.paused_at = new Date().toISOString();
      }
    } else {
      updateData.paused_at = null;
      updateData.resumes_at = null;
      updateData.pause_behavior = null;
    }

    const { error: updateError } = await ctx.supabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', existing.id);

    if (updateError) {
      this.logger.error(
        `Failed to update subscription ${stripeSub.id}:`,
        updateError,
      );
      // Throw so remaining tasks don't proceed with stale data
      throw updateError;
    }

    this.logger.log(
      `Synced status for subscription ${stripeSub.id}: ${stripeSub.status}`,
    );
  }
}
