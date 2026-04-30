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
import { WebhookContext, WebhookHandler } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';
import { SubscriptionsService } from '../../../subscriptions/subscriptions.service';
import { SubscriptionTransitionService } from '../../../subscriptions/subscription-transition.service';

/**
 * Handles `customer.subscription.deleted` webhook events.
 *
 * When Stripe fires this event the subscription is fully canceled.
 * The handler:
 *
 * 1. Skips recently-created incomplete subscriptions (< 5 min old) — these
 *    are transient subs being recycled during discount apply/remove in the
 *    checkout flow.
 * 2. Marks the BOS subscription as `canceled`.
 * 3. Invalidates the product-metrics cache.
 * 4. If the subscription was canceled as part of a downgrade, delegates
 *    completion to {@link SubscriptionTransitionService.handleDowngradeCompletion}.
 * 5. Otherwise, revokes all feature grants for the subscription.
 */
@Injectable()
export class SubscriptionDeletedHandler
  implements WebhookHandler, OnModuleInit
{
  private readonly logger = new Logger(SubscriptionDeletedHandler.name);

  constructor(
    private readonly router: WebhookRouter,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    @Inject(forwardRef(() => SubscriptionTransitionService))
    private readonly transitionService: SubscriptionTransitionService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  onModuleInit(): void {
    this.router.registerHandler('customer.subscription.deleted', this);
  }

  async handle(ctx: WebhookContext): Promise<void> {
    const subscription = ctx.event.data.object as Stripe.Subscription;

    this.logger.log(`Subscription deleted: ${subscription.id}`);

    // Skip recently-created incomplete subscriptions — these are being canceled
    // and recreated during discount apply/remove in the checkout flow.
    // Older incomplete subscriptions (>5 min) should be processed normally.
    if (subscription.status === 'incomplete') {
      const createdAt = subscription.created
        ? new Date(subscription.created * 1000)
        : null;
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      if (createdAt && createdAt > fiveMinutesAgo) {
        this.logger.log(
          `Skipping deletion of recent incomplete subscription ${subscription.id} (likely recreated for discount)`,
        );
        return;
      }
      this.logger.log(
        `Processing deletion of stale incomplete subscription ${subscription.id}`,
      );
    }

    // Get subscription with metadata to detect downgrade completions
    const { data: existing, error: fetchError } = await ctx.supabase
      .from('subscriptions')
      .select('id, organization_id, product_id, metadata')
      .eq('stripe_subscription_id', subscription.id)
      .single();

    if (fetchError || !existing) {
      this.logger.warn(`Subscription ${subscription.id} not found in database`);
      return;
    }

    const subMetadata = (existing.metadata ?? {}) as Record<string, unknown>;

    // Check for pending scheduled downgrade before marking as canceled.
    // If a paid→free downgrade is scheduled, the Stripe sub deletion is expected —
    // keep the BOS sub alive and let the scheduler complete the transition.
    const { data: pendingChange } = await ctx.supabase
      .from('subscription_changes')
      .select('id')
      .eq('subscription_id', existing.id)
      .eq('status', 'scheduled')
      .limit(1)
      .maybeSingle();

    if (pendingChange) {
      // Clear the Stripe link (sub is gone) and make the change immediately due
      // so the scheduler picks it up on the next tick.
      await ctx.supabase
        .from('subscriptions')
        .update({
          stripe_subscription_id: null,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('organization_id', existing.organization_id);

      await ctx.supabase
        .from('subscription_changes')
        .update({
          scheduled_for: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', pendingChange.id)
        .eq('organization_id', existing.organization_id);

      // Invalidate cache (non-critical)
      if (existing.product_id) {
        await this.cacheManager
          .del(`product-metrics:${existing.product_id}`)
          .catch(() => {});
      }

      this.logger.log(
        `Subscription ${subscription.id} deleted (scheduled downgrade pending) — scheduler will complete transition`,
      );
      return;
    }

    // Update subscription status — critical write, must succeed
    const { error: updateError } = await ctx.supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('organization_id', existing.organization_id);

    if (updateError) {
      throw new Error(
        `Failed to mark subscription ${existing.id} as canceled: ${updateError.message}`,
      );
    }

    // Invalidate product revenue metrics cache (non-critical)
    try {
      if (existing.product_id) {
        const cacheKey = `product-metrics:${existing.product_id}`;
        await this.cacheManager.del(cacheKey);
        this.logger.debug(
          `Invalidated cache for product ${existing.product_id} after subscription cancellation`,
        );
      }
    } catch (cacheError) {
      this.logger.warn('Cache invalidation failed (non-critical):', cacheError);
    }

    // Handle downgrade completion: the old sub's period has ended,
    // the new sub's trial should end simultaneously and Stripe will start billing.
    if (subMetadata.canceledReason === 'downgraded') {
      await this.transitionService.handleDowngradeCompletion(
        existing.id,
        subMetadata,
      );
      this.logger.log(
        `Subscription ${subscription.id} downgrade completed — features revoked`,
      );
    } else {
      // Normal cancellation: revoke all feature grants
      await this.subscriptionsService.revokeSubscriptionFeatures(existing.id);
      this.logger.log(
        `Subscription ${subscription.id} canceled and features revoked`,
      );

      // End the usage period for the cancelled subscription so its rows stop
      // appearing in getUsageMetrics (which filters period_end >= now). Keeps
      // the rows for audit (consumed_units preserved); just shifts period_end
      // to the cancellation moment so the read filter naturally hides them.
      const { error: usageEndError } = await ctx.supabase
        .from('usage_records')
        .update({ period_end: new Date().toISOString() })
        .eq('subscription_id', existing.id);

      if (usageEndError) {
        this.logger.warn(
          `Failed to end usage_records for cancelled subscription ${existing.id}: ${usageEndError.message}`,
        );
      }
    }
  }
}
