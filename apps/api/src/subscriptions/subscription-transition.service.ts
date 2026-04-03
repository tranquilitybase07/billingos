import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { SubscriptionsService } from './subscriptions.service';

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
  ) {}

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
          'id, stripe_subscription_id, status, amount, current_period_end, metadata',
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
      metadata: unknown;
    },
    stripeAccountId: string,
    checkoutSessionId?: string,
  ): Promise<TransitionResult> {
    const supabase = this.supabaseService.getClient();

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
