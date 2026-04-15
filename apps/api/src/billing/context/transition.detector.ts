import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { StripeService } from '../../stripe/stripe.service';
import {
  TransitionContext,
  TransitionType,
  OldSubscriptionInfo,
} from './types';

/**
 * Detects whether a checkout is a plan transition (upgrade/downgrade/swap).
 *
 * Extracted from SubscriptionTransitionService.findActiveSubsForDifferentProduct()
 * and the upgrade detection in checkout.service.ts.
 */
@Injectable()
export class TransitionDetector {
  private readonly logger = new Logger(TransitionDetector.name);

  /**
   * Detect if the customer has an active subscription for a different product,
   * indicating a plan change. Also checks explicit existingSubscriptionId.
   *
   * @param stripeAccountId - Connected account ID, used to fetch authoritative
   *   period data from Stripe (source of truth for subscription periods).
   */
  async detect(
    customerId: string,
    newProductId: string,
    newPriceAmount: number,
    explicitExistingSubId?: string,
    stripeAccountId?: string,
  ): Promise<TransitionContext | null> {
    const supabase = this.supabaseService.getClient();

    // If explicit sub ID provided, use it directly
    let oldSubId = explicitExistingSubId;

    // Auto-detect: customer has active sub for a DIFFERENT product
    if (!oldSubId) {
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('id, product_id, amount, status, cancel_at_period_end')
        .eq('customer_id', customerId)
        .neq('product_id', newProductId)
        .in('status', ['active', 'trialing', 'past_due'])
        .is('ended_at', null);

      if (subs && subs.length > 0) {
        oldSubId = subs[0].id;
        this.logger.log(
          `Auto-detected plan change: existing subscription ${oldSubId} for customer ${customerId}`,
        );
      }
    }

    if (!oldSubId) return null;

    // Fetch full old subscription details
    const { data: oldSub } = await supabase
      .from('subscriptions')
      .select(
        'id, stripe_subscription_id, product_id, price_id, amount, status, cancel_at_period_end, current_period_end, metadata',
      )
      .eq('id', oldSubId)
      .single();

    if (!oldSub) {
      this.logger.warn(
        `Existing subscription ${oldSubId} not found — skipping transition`,
      );
      return null;
    }

    // Fetch the old price's recurring interval
    let oldRecurringInterval: OldSubscriptionInfo['recurringInterval'] = 'month';
    if (oldSub.price_id) {
      const { data: oldPrice } = await supabase
        .from('product_prices')
        .select('recurring_interval')
        .eq('id', oldSub.price_id)
        .single();

      if (oldPrice?.recurring_interval) {
        oldRecurringInterval =
          oldPrice.recurring_interval as OldSubscriptionInfo['recurringInterval'];
      }
    }

    // Determine transition type
    const oldAmount = oldSub.amount ?? 0;
    const type: TransitionType =
      newPriceAmount > oldAmount
        ? 'upgrade'
        : newPriceAmount < oldAmount
          ? 'downgrade'
          : 'swap';

    const oldSubscription: OldSubscriptionInfo = {
      id: oldSub.id,
      stripeSubscriptionId: oldSub.stripe_subscription_id,
      productId: oldSub.product_id,
      priceId: oldSub.price_id ?? '',
      amount: oldAmount,
      status: oldSub.status,
      cancelAtPeriodEnd: oldSub.cancel_at_period_end ?? false,
      currentPeriodEnd: oldSub.current_period_end,
      metadata: (oldSub.metadata ?? {}) as Record<string, unknown>,
      recurringInterval: oldRecurringInterval,
    };

    // For downgrades, fetch authoritative period end from Stripe
    let oldPeriodEnd: Date | undefined;
    if (type === 'downgrade') {
      oldPeriodEnd = await this.resolveAuthoritativePeriodEnd(
        oldSub,
        stripeAccountId,
      );
    }

    this.logger.log(
      `Transition detected: ${type} (old=${oldAmount} → new=${newPriceAmount}) ` +
        `for subscription ${oldSub.id}` +
        (oldPeriodEnd ? ` periodEnd=${oldPeriodEnd.toISOString()}` : ''),
    );

    return { type, oldSubscription, oldPeriodEnd };
  }

  /**
   * Fetches the authoritative current_period_end from Stripe (source of truth).
   * Falls back to DB value if Stripe is unreachable.
   * Reconciles the DB if Stripe and DB values differ.
   */
  private async resolveAuthoritativePeriodEnd(
    oldSub: Record<string, unknown>,
    stripeAccountId?: string,
  ): Promise<Date | undefined> {
    const dbPeriodEnd = oldSub.current_period_end
      ? new Date(oldSub.current_period_end as string)
      : undefined;

    if (!oldSub.stripe_subscription_id || !stripeAccountId) {
      return dbPeriodEnd;
    }

    try {
      const stripeSub = await this.stripeService
        .getClient()
        .subscriptions.retrieve(
          oldSub.stripe_subscription_id as string,
          { stripeAccount: stripeAccountId },
        );
      const stripeSubData = stripeSub as unknown as Record<string, unknown>;

      // Stripe API v2025-12-15 moved current_period_end to items.data[0]
      const items = stripeSubData.items as
        | { data?: Array<{ current_period_end?: number }> }
        | undefined;
      const periodEndUnix =
        items?.data?.[0]?.current_period_end ??
        (stripeSubData.current_period_end as number | undefined);

      if (periodEndUnix) {
        const stripePeriodEnd = new Date(periodEndUnix * 1000);

        // Reconcile DB if values differ (> 60s tolerance for rounding)
        if (
          !dbPeriodEnd ||
          Math.abs(stripePeriodEnd.getTime() - dbPeriodEnd.getTime()) > 60000
        ) {
          this.logger.log(
            `Reconciling subscription ${oldSub.id} period end: ` +
              `${dbPeriodEnd?.toISOString() ?? 'null'} → ${stripePeriodEnd.toISOString()}`,
          );
          const supabase = this.supabaseService.getClient();
          await supabase
            .from('subscriptions')
            .update({
              current_period_end: stripePeriodEnd.toISOString(),
            })
            .eq('id', oldSub.id as string);
        }

        return stripePeriodEnd;
      }

      this.logger.warn(
        `Stripe returned no current_period_end for subscription ${oldSub.stripe_subscription_id} — using DB value`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to fetch Stripe subscription ${oldSub.stripe_subscription_id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    return dbPeriodEnd;
  }

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
  ) {}
}
