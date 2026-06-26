import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import Stripe from 'stripe';
import {
  WebhookContext,
  WebhookHandler,
  WebhookTask,
  SubscriptionUpdatedData,
} from '../webhook.types';
import { WebhookRouter } from '../webhook.router';
import { StripeService } from '../../../stripe/stripe.service';
import { SubscriptionsService } from '../../../subscriptions/subscriptions.service';
import { SubscriptionTransitionService } from '../../../subscriptions/subscription-transition.service';
import { SyncStatusTask } from '../tasks/sync-status.task';
import { DetectPriceChangeTask } from '../tasks/detect-price-change.task';
import { HandleRenewalTask } from '../tasks/handle-renewal.task';
import { GrantFeaturesTask } from '../tasks/grant-features.task';
import { InvalidateCacheTask } from '../tasks/invalidate-cache.task';

/**
 * Handles `customer.subscription.updated` webhook events.
 *
 * This is the most complex subscription handler. It orchestrates a
 * pipeline of {@link WebhookTask} instances that run in sequence:
 *
 * 1. **SyncStatus** — write Stripe's authoritative status / period to BOS
 * 2. **DetectPriceChange** — detect in-place price changes and sync BOS
 * 3. **InvalidateCache** — evict stale product-metrics cache
 * 4. **HandleRenewal** — if the billing period advanced, reset usage counters
 * 5. **GrantFeatures** — placeholder for future feature re-grant logic
 *
 * Before the pipeline runs the handler performs early-exit checks:
 * - Transition lock (avoids racing with plan-change checkout)
 * - Already-canceled by plan transition (avoids resurrecting stale state)
 * - Terminal `incomplete_expired` status (revoke features and exit)
 */
@Injectable()
export class SubscriptionUpdatedHandler
  implements WebhookHandler, OnModuleInit
{
  private readonly logger = new Logger(SubscriptionUpdatedHandler.name);
  private readonly tasks: WebhookTask<SubscriptionUpdatedData>[];

  constructor(
    private readonly router: WebhookRouter,
    private readonly stripeService: StripeService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    @Inject(forwardRef(() => SubscriptionTransitionService))
    private readonly transitionService: SubscriptionTransitionService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    // Build the task pipeline. Tasks that need external dependencies
    // receive them via their constructor.
    this.tasks = [
      new SyncStatusTask(),
      new DetectPriceChangeTask(),
      new InvalidateCacheTask(this.cacheManager),
      new HandleRenewalTask(this.subscriptionsService),
      new GrantFeaturesTask(),
    ];
  }

  onModuleInit(): void {
    this.router.registerHandler('customer.subscription.updated', this);
  }

  async handle(ctx: WebhookContext): Promise<void> {
    const subscription = ctx.event.data.object as Stripe.Subscription;
    const stripeAccountId = ctx.stripeAccountId || '';

    try {
      this.logger.log(
        `Subscription updated: ${subscription.id} - status: ${subscription.status}`,
      );

      // ── Fetch existing BOS record ──
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('subscriptions')
        .select(
          'id, customer_id, current_period_start, current_period_end, status, metadata, paused_at',
        )
        .eq('stripe_subscription_id', subscription.id)
        .single();

      if (fetchError || !existing) {
        this.logger.warn(
          `Subscription ${subscription.id} not found in database`,
        );
        return;
      }

      // ── Early-exit: transition lock ──
      if (existing.customer_id) {
        const subLocked = await this.transitionService.isTransitionLocked(
          existing.customer_id,
        );
        if (subLocked) {
          this.logger.log(
            `Transition lock active for subscription ${subscription.id} — skipping update`,
          );
          return;
        }
      }

      // ── Early-exit: already canceled by plan transition ──
      if (
        existing.status === 'canceled' &&
        (existing.metadata as Record<string, unknown>)?.canceledReason
      ) {
        this.logger.log(
          `Subscription ${subscription.id} already canceled by plan transition — skipping update`,
        );
        return;
      }

      // ── Early-exit: incomplete_expired (terminal) ──
      if (subscription.status === 'incomplete_expired') {
        this.logger.log(
          `Subscription ${subscription.id} reached incomplete_expired — revoking features`,
        );

        await ctx.supabase
          .from('subscriptions')
          .update({
            status: 'incomplete_expired',
            ended_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        await this.subscriptionsService.revokeSubscriptionFeatures(existing.id);

        // Invalidate cache
        const { data: subForCache } = await ctx.supabase
          .from('subscriptions')
          .select('product_id')
          .eq('id', existing.id)
          .single();

        if (subForCache?.product_id) {
          await this.cacheManager.del(
            `product-metrics:${subForCache.product_id}`,
          );
        }

        return;
      }

      // ── Fetch authoritative state from Stripe ──
      let authoritativeSubscription = subscription;
      try {
        const accountId = stripeAccountId || null;
        const freshSub = await this.stripeService
          .getClient()
          .subscriptions.retrieve(
            subscription.id,
            accountId ? { stripeAccount: accountId } : undefined,
          );
        authoritativeSubscription = freshSub;
        this.logger.debug(
          `Fresh Stripe status for ${subscription.id}: ${freshSub.status} (webhook had: ${subscription.status})`,
        );
      } catch (stripeError) {
        this.logger.warn(
          `Could not fetch fresh subscription ${subscription.id} from Stripe — using webhook status`,
          stripeError,
        );
      }

      // ── Compute period change flag ──
      const subData = authoritativeSubscription as Stripe.Subscription & {
        current_period_start?: number;
        current_period_end?: number;
      };

      const newPeriodStart = subData.current_period_start
        ? new Date(subData.current_period_start * 1000)
        : null;
      const existingPeriodStart = existing.current_period_start
        ? new Date(existing.current_period_start)
        : null;

      const periodChanged = !!(
        newPeriodStart &&
        existingPeriodStart &&
        newPeriodStart.getTime() !== existingPeriodStart.getTime()
      );

      // ── Build task data ──
      const taskData: SubscriptionUpdatedData = {
        existing: {
          id: existing.id,
          customer_id: existing.customer_id,
          product_id: '', // will be resolved by tasks from DB
          price_id: null,
          status: existing.status,
          stripe_subscription_id: subscription.id,
          current_period_start: existing.current_period_start,
          current_period_end: existing.current_period_end,
          cancel_at_period_end: false,
          amount: null,
          currency: null,
          metadata: existing.metadata as Record<string, unknown> | null,
          paused_at:
            (existing as { paused_at?: string | null }).paused_at ?? null,
        },
        stripeSub: authoritativeSubscription,
        stripeAccountId,
        periodChanged,
      };

      // ── Run task pipeline ──
      for (const task of this.tasks) {
        try {
          await task.execute(ctx, taskData);
        } catch (taskError) {
          this.logger.error(
            `Task ${task.name} failed for subscription ${subscription.id}:`,
            taskError,
          );
          // If SyncStatus fails, abort the pipeline — downstream tasks
          // depend on the DB being updated.
          if (task.name === 'SyncStatus') {
            return;
          }
          // Other task failures are non-critical; continue the pipeline.
        }
      }

      this.logger.log(`Subscription ${subscription.id} updated successfully`);
    } catch (error) {
      this.logger.error('Error handling subscription.updated:', error);
    }
  }
}
