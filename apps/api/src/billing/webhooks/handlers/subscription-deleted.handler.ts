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
      .select('id, product_id, metadata')
      .eq('stripe_subscription_id', subscription.id)
      .single();

    if (fetchError || !existing) {
      this.logger.warn(
        `Subscription ${subscription.id} not found in database`,
      );
      return;
    }

    const subMetadata = (existing.metadata ?? {}) as Record<string, unknown>;

    // Update subscription status — critical write, must succeed
    const { error: updateError } = await ctx.supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

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
    }
  }
}
