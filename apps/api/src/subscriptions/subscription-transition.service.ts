import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { SubscriptionsService } from './subscriptions.service';
import { EntitlementService } from '../billing/entitlements/entitlement.service';
import { RedisService } from '../redis/redis.service';

export interface TransitionResult {
  type: 'upgrade' | 'downgrade' | 'swap';
  oldSubscriptionId: string;
  oldStripeSubscriptionId: string | null;
  canceled: boolean;
  /** For downgrades: the old subscription's period end (new sub should trial until this date) */
  oldPeriodEnd?: Date;
}

@Injectable()
export class SubscriptionTransitionService {
  private readonly logger = new Logger(SubscriptionTransitionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject(forwardRef(() => StripeService))
    private readonly stripeService: StripeService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    private readonly entitlementService: EntitlementService,
    private readonly redisService: RedisService,
  ) {}

  // ── Redis lock helpers ──

  private async acquireTransitionLock(customerId: string): Promise<boolean> {
    return this.redisService.setIdempotencyKey(
      `transition:lock:${customerId}`,
      Date.now().toString(),
      30000, // 30s TTL
    );
  }

  private async releaseTransitionLock(customerId: string): Promise<void> {
    await this.redisService.delete(`transition:lock:${customerId}`);
  }

  async isTransitionLocked(customerId: string): Promise<boolean> {
    return this.redisService.checkIdempotencyKey(
      `transition:lock:${customerId}`,
    );
  }

  // ── Shared detection query (eliminates 4 duplicated queries) ──

  async findActiveSubsForDifferentProduct(
    customerId: string,
    newProductId: string,
  ): Promise<
    Array<{
      id: string;
      product_id: string;
      amount: number | null;
      status: string;
      cancel_at_period_end: boolean | null;
    }>
  > {
    const supabase = this.supabaseService.getClient();
    const { data } = await supabase
      .from('subscriptions')
      .select('id, product_id, amount, status, cancel_at_period_end')
      .eq('customer_id', customerId)
      .neq('product_id', newProductId)
      .in('status', ['active', 'trialing', 'past_due'])
      .is('ended_at', null);

    return data || [];
  }

  // ── Detect + full transition (for confirmed checkouts) ──

  async detectAndTransition(
    customerId: string,
    newProductId: string,
    stripeAccountId: string,
    newPriceAmount: number,
    checkoutSessionId?: string,
  ): Promise<TransitionResult | null> {
    const acquired = await this.acquireTransitionLock(customerId);
    if (!acquired) {
      this.logger.log(
        `Transition lock already held for customer ${customerId} — skipping`,
      );
      return null;
    }

    try {
      const subs = await this.findActiveSubsForDifferentProduct(
        customerId,
        newProductId,
      );
      if (subs.length === 0) return null;

      this.logger.log(
        `detectAndTransition: found ${subs.length} active sub(s) for customer ${customerId}, transitioning first`,
      );
      return await this.handleTransition(
        subs[0].id,
        stripeAccountId,
        newPriceAmount,
        checkoutSessionId,
      );
    } finally {
      await this.releaseTransitionLock(customerId);
    }
  }

  // ── Pre-checkout transition (only cancels safe-to-cancel-now subs) ──

  async handlePreCheckoutTransition(
    customerId: string,
    newProductId: string,
    stripeAccountId: string,
  ): Promise<{ canceledSubId?: string; remainingSubId?: string }> {
    const subs = await this.findActiveSubsForDifferentProduct(
      customerId,
      newProductId,
    );
    if (subs.length === 0) return {};

    const oldSub = subs[0];
    const shouldCancelNow =
      oldSub.status === 'trialing' ||
      oldSub.status === 'past_due' ||
      oldSub.cancel_at_period_end === true;

    if (shouldCancelNow) {
      const supabase = this.supabaseService.getClient();
      const now = new Date().toISOString();

      this.logger.log(
        `Pre-checkout: canceling subscription ${oldSub.id} (status: ${oldSub.status}) before plan change`,
      );

      // Fetch full sub for Stripe cancellation
      const { data: fullSub } = await supabase
        .from('subscriptions')
        .select('id, stripe_subscription_id, metadata')
        .eq('id', oldSub.id)
        .single();

      // Mark canceled in BOS DB first
      const oldMeta =
        ((fullSub?.metadata ?? {}) as Record<string, unknown>) || {};
      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          canceled_at: now,
          ended_at: now,
          cancel_at_period_end: false,
          metadata: { ...oldMeta, canceledReason: 'plan_change' },
        })
        .eq('id', oldSub.id);

      // Revoke features
      await this.subscriptionsService.revokeSubscriptionFeatures(oldSub.id);

      // Cancel on Stripe last
      if (fullSub?.stripe_subscription_id?.startsWith('sub_')) {
        try {
          await this.stripeService.cancelSubscription(
            fullSub.stripe_subscription_id,
            stripeAccountId,
            false,
          );
        } catch (cancelError) {
          this.logger.warn(
            `Failed to cancel Stripe subscription ${fullSub.stripe_subscription_id}:`,
            cancelError,
          );
        }
      }

      return { canceledSubId: oldSub.id };
    }

    // Active sub — pass through for post-checkout transition
    return { remainingSubId: oldSub.id };
  }

  // ── Dedup guard: cancel duplicate active subs for same customer+product ──

  async cleanupDuplicateSubscriptions(
    customerId: string,
    productId: string,
    stripeAccountId: string,
    keepSubId?: string,
  ): Promise<number> {
    const supabase = this.supabaseService.getClient();

    const { data: activeSubs } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, created_at, metadata')
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .in('status', ['active', 'trialing', 'past_due'])
      .is('ended_at', null)
      .order('created_at', { ascending: false });

    if (!activeSubs || activeSubs.length <= 1) return 0;

    // Keep the specified sub, or the newest one
    const keepId = keepSubId || activeSubs[0].id;
    const duplicates = activeSubs.filter((s) => s.id !== keepId);

    this.logger.warn(
      `Found ${duplicates.length} duplicate active subscription(s) for customer ${customerId}, product ${productId} — cleaning up`,
    );

    let canceledCount = 0;
    for (const dup of duplicates) {
      const oldMeta = ((dup.metadata ?? {}) as Record<string, unknown>) || {};
      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          cancel_at_period_end: false,
          metadata: { ...oldMeta, canceledReason: 'duplicate_cleanup' },
        })
        .eq('id', dup.id);

      await this.subscriptionsService.revokeSubscriptionFeatures(dup.id);

      if (dup.stripe_subscription_id?.startsWith('sub_')) {
        try {
          await this.stripeService.cancelSubscription(
            dup.stripe_subscription_id,
            stripeAccountId,
            false,
          );
        } catch (err) {
          this.logger.warn(
            `Failed to cancel duplicate Stripe subscription ${dup.stripe_subscription_id}:`,
            err,
          );
        }
      }

      canceledCount++;
    }

    this.logger.log(`Cleaned up ${canceledCount} duplicate subscription(s)`);
    return canceledCount;
  }

  /**
   * Handle plan transition (upgrade, downgrade, or same-price swap).
   *
   * Upgrade (new price > old):  Cancel old immediately, revoke features.
   * Downgrade (new price < old): Set old to cancel_at_period_end, keep features until period end.
   * Same price (swap):          Treat as upgrade (immediate cancel).
   *
   * MUST be called BEFORE the new subscription row is created/updated in the DB,
   * so the old stripe_subscription_id hasn't been overwritten.
   */
  async handleTransition(
    existingSubscriptionId: string,
    stripeAccountId: string,
    newPriceAmount: number,
    checkoutSessionId?: string,
  ): Promise<TransitionResult | null> {
    const supabase = this.supabaseService.getClient();

    try {
      const { data: oldSub } = await supabase
        .from('subscriptions')
        .select(
          'id, stripe_subscription_id, status, amount, current_period_end, cancel_at_period_end, metadata',
        )
        .eq('id', existingSubscriptionId)
        .single();

      if (!oldSub) {
        this.logger.warn(
          `Existing subscription ${existingSubscriptionId} not found — skipping transition`,
        );
        return null;
      }

      const oldAmount = oldSub.amount ?? 0;
      const isDowngrade = newPriceAmount < oldAmount;
      const type: TransitionResult['type'] =
        newPriceAmount > oldAmount
          ? 'upgrade'
          : newPriceAmount < oldAmount
            ? 'downgrade'
            : 'swap';

      this.logger.log(
        `Plan transition: ${type} (old=${oldAmount} → new=${newPriceAmount}) ` +
          `for subscription ${oldSub.id}`,
      );

      if (isDowngrade) {
        return await this.handleDowngrade(
          oldSub,
          stripeAccountId,
          checkoutSessionId,
        );
      } else {
        return await this.handleUpgrade(
          oldSub,
          stripeAccountId,
          type as 'upgrade' | 'swap',
          checkoutSessionId,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error during plan transition for subscription ${existingSubscriptionId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Upgrade or same-price swap: cancel old subscription immediately, revoke features.
   */
  private async handleUpgrade(
    oldSub: {
      id: string;
      stripe_subscription_id: string | null;
      status: string;
      amount: number | null;
      current_period_end: string | null;
      metadata: unknown;
    },
    stripeAccountId: string,
    type: 'upgrade' | 'swap',
    checkoutSessionId?: string,
  ): Promise<TransitionResult> {
    const supabase = this.supabaseService.getClient();

    // Cancel on Stripe immediately
    if (oldSub.stripe_subscription_id?.startsWith('sub_')) {
      try {
        await this.stripeService.cancelSubscription(
          oldSub.stripe_subscription_id,
          stripeAccountId,
          false, // immediate cancel
        );
        this.logger.log(
          `Stripe subscription ${oldSub.stripe_subscription_id} canceled immediately (${type})`,
        );
      } catch (stripeError) {
        this.logger.warn(
          `Failed to cancel Stripe subscription ${oldSub.stripe_subscription_id}:`,
          stripeError,
        );
      }
    }

    // Update BOS DB
    await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
        metadata: {
          ...((oldSub.metadata ?? {}) as Record<string, unknown>),
          canceledReason: type === 'upgrade' ? 'upgraded' : 'plan_swapped',
          newSubscriptionCheckoutSessionId: checkoutSessionId,
        },
      })
      .eq('id', oldSub.id);

    // Revoke features immediately
    await this.subscriptionsService.revokeSubscriptionFeatures(oldSub.id);

    this.logger.log(
      `Subscription ${oldSub.id} canceled and features revoked (${type})`,
    );

    return {
      type,
      oldSubscriptionId: oldSub.id,
      oldStripeSubscriptionId: oldSub.stripe_subscription_id,
      canceled: true,
    };
  }

  /**
   * Downgrade: set old subscription to cancel_at_period_end, keep features until period end.
   * The new subscription should be created with trial_end = old sub's current_period_end
   * so the customer isn't double-charged.
   */
  private async handleDowngrade(
    oldSub: {
      id: string;
      stripe_subscription_id: string | null;
      status: string;
      amount: number | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean | null;
      metadata: unknown;
    },
    stripeAccountId: string,
    checkoutSessionId?: string,
  ): Promise<TransitionResult> {
    const supabase = this.supabaseService.getClient();

    // Trialing / past_due / already-canceling → cancel immediately (no paid value to preserve)
    const shouldCancelImmediately =
      oldSub.status === 'trialing' ||
      oldSub.status === 'past_due' ||
      oldSub.cancel_at_period_end === true;

    if (shouldCancelImmediately) {
      this.logger.log(
        `Downgrade: canceling subscription ${oldSub.id} immediately ` +
          `(status=${oldSub.status}, cancel_at_period_end=${oldSub.cancel_at_period_end})`,
      );

      // Cancel on Stripe immediately
      if (oldSub.stripe_subscription_id?.startsWith('sub_')) {
        try {
          await this.stripeService.cancelSubscription(
            oldSub.stripe_subscription_id,
            stripeAccountId,
            false, // immediate cancel
          );
        } catch (stripeError) {
          this.logger.warn(
            `Failed to cancel Stripe subscription ${oldSub.stripe_subscription_id}:`,
            stripeError,
          );
        }
      }

      // Mark canceled in DB
      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
          metadata: {
            ...((oldSub.metadata ?? {}) as Record<string, unknown>),
            canceledReason: 'downgraded',
            newSubscriptionCheckoutSessionId: checkoutSessionId,
          },
        })
        .eq('id', oldSub.id);

      // Revoke features immediately
      await this.subscriptionsService.revokeSubscriptionFeatures(oldSub.id);

      return {
        type: 'downgrade',
        oldSubscriptionId: oldSub.id,
        oldStripeSubscriptionId: oldSub.stripe_subscription_id,
        canceled: true,
      };
    }

    // Healthy active subscription — cancel at period end to honor the paid period
    const oldPeriodEnd = oldSub.current_period_end
      ? new Date(oldSub.current_period_end)
      : new Date();

    // Set old Stripe subscription to cancel at period end
    if (oldSub.stripe_subscription_id?.startsWith('sub_')) {
      try {
        await this.stripeService.cancelSubscription(
          oldSub.stripe_subscription_id,
          stripeAccountId,
          true, // cancel at period end
        );
        this.logger.log(
          `Stripe subscription ${oldSub.stripe_subscription_id} set to cancel_at_period_end (downgrade)`,
        );
      } catch (stripeError) {
        this.logger.warn(
          `Failed to set cancel_at_period_end on Stripe subscription ${oldSub.stripe_subscription_id}:`,
          stripeError,
        );
      }
    }

    // Update BOS DB — keep active, mark as pending downgrade
    await supabase
      .from('subscriptions')
      .update({
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          ...((oldSub.metadata ?? {}) as Record<string, unknown>),
          canceledReason: 'downgraded',
          newSubscriptionCheckoutSessionId: checkoutSessionId,
          pendingDowngradeAt: oldPeriodEnd.toISOString(),
        },
      })
      .eq('id', oldSub.id);

    // Do NOT revoke features yet — old features stay active until period end.
    // Features will be revoked when handleSubscriptionDeleted fires for the old sub.

    this.logger.log(
      `Subscription ${oldSub.id} set to cancel at period end ${oldPeriodEnd.toISOString()} (downgrade)`,
    );

    return {
      type: 'downgrade',
      oldSubscriptionId: oldSub.id,
      oldStripeSubscriptionId: oldSub.stripe_subscription_id,
      canceled: false,
      oldPeriodEnd,
    };
  }

  // ── In-place upgrade via Stripe subscription.update() ──

  /**
   * Upgrade a subscription in-place using Stripe's subscription.update().
   * Instead of cancel+create, this updates the existing Stripe subscription
   * to a new price, and Stripe handles proration automatically.
   */
  async handleUpgradeInPlace(
    existingBosSubId: string,
    newProductId: string,
    newPriceId: string,
    newStripePriceId: string,
    stripeAccountId: string,
    newAmount: number,
  ): Promise<{
    updatedStripeSubscription: Stripe.Subscription;
    bosSubscriptionId: string;
  }> {
    const supabase = this.supabaseService.getClient();

    // 1. Fetch old BOS subscription
    const { data: oldSub } = await supabase
      .from('subscriptions')
      .select(
        'id, stripe_subscription_id, product_id, customer_id, organization_id, metadata',
      )
      .eq('id', existingBosSubId)
      .single();

    if (!oldSub || !oldSub.stripe_subscription_id?.startsWith('sub_')) {
      throw new Error(
        `Subscription ${existingBosSubId} not found or has no Stripe subscription`,
      );
    }

    // 2. Update the Stripe subscription in-place
    const updatedStripeSub = await this.stripeService.updateSubscriptionPrice(
      oldSub.stripe_subscription_id,
      newStripePriceId,
      stripeAccountId,
    );

    // 3. Update BOS subscription record with new product/price/amount
    const subData = updatedStripeSub as any;
    const periodStart = subData.current_period_start
      ? new Date(subData.current_period_start * 1000)
      : new Date();
    const periodEnd = subData.current_period_end
      ? new Date(subData.current_period_end * 1000)
      : new Date();

    const { data: updateResult, error: bosUpdateError } = await supabase
      .from('subscriptions')
      .update({
        product_id: newProductId,
        price_id: newPriceId,
        amount: newAmount,
        // Don't update period dates here — the webhook syncs them from Stripe.
        // Writing them here can trigger the subscriptions_check constraint
        // (current_period_end > current_period_start) when timestamps are equal.
        status: updatedStripeSub.status,
        updated_at: new Date().toISOString(),
        metadata: {
          ...((oldSub.metadata ?? {}) as Record<string, unknown>),
          upgradedAt: new Date().toISOString(),
          previousProductId: oldSub.product_id,
          upgradeMethod: 'in_place',
        },
      })
      .eq('id', oldSub.id)
      .select('product_id, price_id, amount')
      .single();

    if (bosUpdateError) {
      this.logger.error(
        `BOS UPDATE FAILED for sub ${oldSub.id}: ${bosUpdateError.message} (code: ${bosUpdateError.code})`,
      );
      throw new Error(
        `BOS subscription update failed: ${bosUpdateError.message}`,
      );
    } else {
      this.logger.log(
        `BOS UPDATE OK for sub ${oldSub.id}: product=${updateResult?.product_id}, price=${updateResult?.price_id}, amount=${updateResult?.amount}`,
      );
    }

    // 4. Swap feature grants: soft-revoke old → grant new
    // The partial unique index (WHERE revoked_at IS NULL) allows soft-revoke
    // without conflicting on (subscription_id, feature_id) re-grants.
    await this.entitlementService.swapForSubscription({
      subscriptionId: oldSub.id,
      customerId: oldSub.customer_id,
      newProductId,
      periodStart,
      periodEnd,
    });

    this.logger.log(
      `In-place upgrade complete: subscription ${oldSub.id} updated from product ${oldSub.product_id} to ${newProductId}`,
    );

    return {
      updatedStripeSubscription: updatedStripeSub,
      bosSubscriptionId: oldSub.id,
    };
  }

  /**
   * Preview the prorated amount for upgrading a subscription to a new price.
   * Uses Stripe's upcoming invoice preview to calculate exact proration.
   */
  async previewProration(
    existingBosSubId: string,
    newStripePriceId: string,
    stripeAccountId: string,
  ): Promise<{
    proratedAmount: number;
    creditAmount: number;
    newPlanCharge: number;
    currency: string;
    immediateCharge: boolean;
  }> {
    const supabase = this.supabaseService.getClient();

    // Fetch BOS subscription + Stripe customer ID
    const { data: sub } = await supabase
      .from('subscriptions')
      .select(
        'id, stripe_subscription_id, customer_id, customers!inner(stripe_customer_id)',
      )
      .eq('id', existingBosSubId)
      .single();

    if (
      !sub ||
      !sub.stripe_subscription_id?.startsWith('sub_') ||
      !(sub as any).customers?.stripe_customer_id
    ) {
      throw new Error(
        `Subscription ${existingBosSubId} not found or missing Stripe IDs`,
      );
    }

    const stripeCustomerId = (sub as any).customers.stripe_customer_id;

    // Get upcoming invoice preview from Stripe
    const upcomingInvoice = await this.stripeService.retrieveUpcomingInvoice(
      sub.stripe_subscription_id,
      stripeCustomerId,
      newStripePriceId,
      stripeAccountId,
    );

    // Parse proration from upcoming invoice line items
    let creditAmount = 0;
    let newPlanCharge = 0;

    for (const line of upcomingInvoice.lines?.data || []) {
      // In Stripe SDK v20+, proration is indicated via line.parent details
      const parent = line.parent;
      const isProration =
        parent?.invoice_item_details?.proration === true ||
        parent?.subscription_item_details?.proration === true;
      if (isProration) {
        if (line.amount < 0) {
          creditAmount += Math.abs(line.amount);
        } else {
          newPlanCharge += line.amount;
        }
      }
    }

    const proratedAmount = newPlanCharge - creditAmount;
    const currency = upcomingInvoice.currency || (sub as any).currency || 'usd';

    return {
      proratedAmount,
      creditAmount,
      newPlanCharge,
      currency,
      immediateCharge: proratedAmount > 0,
    };
  }

  /**
   * Called from handleSubscriptionDeleted when a downgraded subscription ends.
   * Revokes old features (the new subscription should already be active or trialing).
   */
  async handleDowngradeCompletion(
    subscriptionId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(
      `Downgrade completion: revoking features for subscription ${subscriptionId}`,
    );

    await this.subscriptionsService.revokeSubscriptionFeatures(subscriptionId);

    this.logger.log(
      `Downgrade complete: features revoked for subscription ${subscriptionId}`,
    );
  }
}
