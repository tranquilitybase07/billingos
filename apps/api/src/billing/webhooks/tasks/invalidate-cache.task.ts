import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import {
  WebhookContext,
  WebhookTask,
  SubscriptionUpdatedData,
} from '../webhook.types';

/**
 * Invalidate the product-metrics cache after subscription changes.
 *
 * The analytics layer caches per-product revenue metrics. When a subscription
 * is created, updated, or deleted the cached values are stale and must be
 * evicted so the next read re-computes them from the database.
 */
export class InvalidateCacheTask implements WebhookTask<SubscriptionUpdatedData> {
  readonly name = 'InvalidateCache';
  private readonly logger = new Logger(InvalidateCacheTask.name);

  constructor(private readonly cacheManager: Cache) {}

  async execute(
    ctx: WebhookContext,
    data: SubscriptionUpdatedData,
  ): Promise<void> {
    // Re-fetch product_id from DB because the DetectPriceChange task
    // may have changed it since the handler loaded `existing`.
    const { data: subscriptionData } = await ctx.supabase
      .from('subscriptions')
      .select('product_id')
      .eq('id', data.existing.id)
      .single();

    if (!subscriptionData?.product_id) {
      return;
    }

    const cacheKey = `product-metrics:${subscriptionData.product_id}`;
    await this.cacheManager.del(cacheKey);
    this.logger.debug(
      `Invalidated cache for product ${subscriptionData.product_id} after subscription update`,
    );
  }
}
