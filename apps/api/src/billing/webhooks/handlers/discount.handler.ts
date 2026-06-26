import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookContext, WebhookHandler } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';
import { StripeService } from '../../../stripe/stripe.service';

/**
 * Handles `customer.discount.created|updated|deleted`.
 *
 * Keeps the BOS `subscriptions.active_discount` cache in sync with Stripe (the
 * source of truth). This is the read source for the churn discount
 * re-redemption guard, so the offer/accept hot path never calls Stripe.
 *
 * `customer.discount.deleted` is what fires when a `repeating` coupon's duration
 * completes (or a discount is removed) — that's when the cache must be cleared so
 * a customer becomes re-eligible (when the merchant allows repeat redemption).
 */
@Injectable()
export class DiscountHandler implements WebhookHandler, OnModuleInit {
  private readonly logger = new Logger(DiscountHandler.name);

  constructor(
    private readonly router: WebhookRouter,
    private readonly stripeService: StripeService,
  ) {}

  onModuleInit(): void {
    this.router.registerHandler(
      [
        'customer.discount.created',
        'customer.discount.updated',
        'customer.discount.deleted',
      ],
      this,
    );
  }

  async handle(ctx: WebhookContext): Promise<void> {
    // Covers both Discount and DeletedDiscount — coupon nests under source.coupon
    // (string id, or expanded Coupon when present in the payload).
    const discount = ctx.event.data.object as unknown as {
      subscription: string | null;
      end?: number | null;
      source?: { coupon: string | Stripe.Coupon | null } | null;
    };
    const subscriptionId =
      typeof discount.subscription === 'string' ? discount.subscription : null;

    if (!subscriptionId) {
      // Customer-level discount (not subscription-scoped) — nothing to cache.
      return;
    }

    // Resolve the org from the webhook's connected account so the write is
    // org-scoped (tenant-isolation rule). Skip if we can't establish it.
    const organizationId = await this.resolveOrganizationId(ctx);
    if (!organizationId) {
      this.logger.warn(
        `Could not resolve organization for account ${ctx.stripeAccountId}; skipping active_discount sync`,
      );
      return;
    }

    if (ctx.event.type === 'customer.discount.deleted') {
      await this.write(ctx, organizationId, subscriptionId, null);
      this.logger.log(`Cleared active_discount for ${subscriptionId}`);
      return;
    }

    const couponRef = discount.source?.coupon ?? null;
    let coupon = couponRef && typeof couponRef === 'object' ? couponRef : null;
    const couponId =
      typeof couponRef === 'string' ? couponRef : (coupon?.id ?? null);

    // Webhook payloads don't expand `source.coupon` — it's just the id. Fetch the
    // coupon so we cache the real percent_off/amount_off (otherwise we'd clobber
    // the write-through values with nulls).
    if (!coupon && couponId && ctx.stripeAccountId) {
      try {
        coupon = await this.stripeService.retrieveCoupon(
          couponId,
          ctx.stripeAccountId,
        );
      } catch (err) {
        this.logger.warn(
          `Could not retrieve coupon ${couponId}: ${(err as Error).message}`,
        );
      }
    }

    const activeDiscount = {
      source: couponId?.startsWith('churn_') ? 'churn' : 'external',
      couponId,
      percentOff: coupon?.percent_off ?? null,
      amountOff: coupon?.amount_off ?? null,
      endsAt: discount.end
        ? new Date(discount.end * 1000).toISOString()
        : null,
    };

    await this.write(ctx, organizationId, subscriptionId, activeDiscount);
    this.logger.log(
      `Synced active_discount for ${subscriptionId} (${ctx.event.type})`,
    );
  }

  /** Resolve organization_id from the webhook's connected Stripe account. */
  private async resolveOrganizationId(
    ctx: WebhookContext,
  ): Promise<string | null> {
    if (!ctx.stripeAccountId) return null;

    const { data: account } = await ctx.supabase
      .from('accounts')
      .select('id')
      .eq('stripe_id', ctx.stripeAccountId)
      .maybeSingle();
    if (!account) return null;

    const { data: org } = await ctx.supabase
      .from('organizations')
      .select('id')
      .eq('account_id', account.id)
      .maybeSingle();

    return org?.id ?? null;
  }

  private async write(
    ctx: WebhookContext,
    organizationId: string,
    stripeSubscriptionId: string,
    value: Record<string, unknown> | null,
  ): Promise<void> {
    const { error } = await ctx.supabase
      .from('subscriptions')
      .update({ active_discount: value as never })
      .eq('organization_id', organizationId)
      .eq('stripe_subscription_id', stripeSubscriptionId);

    if (error) {
      this.logger.warn(
        `Failed to sync active_discount for ${stripeSubscriptionId}: ${error.message}`,
      );
    }
  }
}
