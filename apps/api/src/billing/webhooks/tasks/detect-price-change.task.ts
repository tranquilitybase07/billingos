import { Logger } from '@nestjs/common';
import {
  WebhookContext,
  WebhookTask,
  SubscriptionUpdatedData,
} from '../webhook.types';

/**
 * Detect in-place price changes on a Stripe subscription and
 * sync the BOS subscription record to match.
 *
 * When a subscription is upgraded via Stripe's subscription.update()
 * (as opposed to cancel-and-recreate), the Stripe price changes in place.
 * This task detects that drift and updates the BOS product_id, price_id,
 * and amount accordingly.
 */
export class DetectPriceChangeTask implements WebhookTask<SubscriptionUpdatedData> {
  readonly name = 'DetectPriceChange';
  private readonly logger = new Logger(DetectPriceChangeTask.name);

  async execute(
    ctx: WebhookContext,
    data: SubscriptionUpdatedData,
  ): Promise<void> {
    const { existing, stripeSub } = data;

    const currentStripePrice = stripeSub.items?.data?.[0]?.price?.id;

    this.logger.log(
      `Webhook price check for sub ${stripeSub.id}: currentStripePrice=${currentStripePrice}`,
    );

    if (!currentStripePrice) {
      return;
    }

    const { data: bosSubForPrice } = await ctx.supabase
      .from('subscriptions')
      .select('price_id, product_prices!inner(stripe_price_id)')
      .eq('id', existing.id)
      .single();

    const bosStripePriceId = (
      bosSubForPrice as Record<string, unknown> & {
        product_prices?: { stripe_price_id?: string };
      }
    )?.product_prices?.stripe_price_id;

    this.logger.log(
      `Webhook price comparison for sub ${stripeSub.id}: ` +
        `BOS stripe_price=${bosStripePriceId}, Stripe current_price=${currentStripePrice}, ` +
        `match=${bosStripePriceId === currentStripePrice}`,
    );

    if (!bosStripePriceId || bosStripePriceId === currentStripePrice) {
      return;
    }

    this.logger.log(
      `Detected price change on subscription ${stripeSub.id}: ` +
        `BOS price ${bosStripePriceId} → Stripe price ${currentStripePrice}. ` +
        `Syncing BOS record to match Stripe.`,
    );

    // Look up BOS price matching Stripe's current price
    const { data: newBosPrice } = await ctx.supabase
      .from('product_prices')
      .select('id, product_id, price_amount')
      .eq('stripe_price_id', currentStripePrice)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (newBosPrice) {
      const { error: syncError } = await ctx.supabase
        .from('subscriptions')
        .update({
          product_id: newBosPrice.product_id,
          price_id: newBosPrice.id,
          amount: newBosPrice.price_amount ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (syncError) {
        this.logger.error(
          `Failed to sync subscription ${stripeSub.id} after price change:`,
          syncError,
        );
      } else {
        this.logger.log(
          `Synced subscription ${stripeSub.id}: product=${newBosPrice.product_id}, price=${newBosPrice.id}`,
        );
      }
    } else {
      this.logger.warn(
        `No BOS price found for Stripe price ${currentStripePrice} — subscription ${stripeSub.id} may be out of sync`,
      );
    }
  }
}
