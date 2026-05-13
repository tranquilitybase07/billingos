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

    // Single query that fetches the sub plus the old price's recurring
    // interval via a join. Replaces the previous 2-3 sequential queries
    // (subs-by-customer → full sub → price).
    const subSelect = `
      id, organization_id, stripe_subscription_id, product_id, price_id,
      amount, status, cancel_at_period_end, current_period_end, metadata,
      price:product_prices(recurring_interval)
    `;

    type JoinedPrice = { recurring_interval?: string };
    type OldSubRow = {
      id: string;
      organization_id: string;
      stripe_subscription_id: string | null;
      product_id: string;
      price_id: string | null;
      amount: number | null;
      status: string;
      cancel_at_period_end: boolean | null;
      current_period_end: string | null;
      metadata: Record<string, unknown> | null;
      price: JoinedPrice | JoinedPrice[] | null;
    };

    let oldSub: OldSubRow | null = null;
    if (explicitExistingSubId) {
      const { data } = await supabase
        .from('subscriptions')
        .select(subSelect)
        .eq('id', explicitExistingSubId)
        .single();
      oldSub = data as unknown as OldSubRow | null;
    } else {
      const { data } = await supabase
        .from('subscriptions')
        .select(subSelect)
        .eq('customer_id', customerId)
        .neq('product_id', newProductId)
        .in('status', ['active', 'trialing', 'past_due'])
        .is('ended_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      oldSub = data as unknown as OldSubRow | null;
      if (oldSub) {
        this.logger.log(
          `Auto-detected plan change: existing subscription ${oldSub.id} for customer ${customerId}`,
        );
      }
    }

    if (!oldSub) return null;

    const recurringIntervalRaw = Array.isArray(oldSub.price)
      ? oldSub.price[0]?.recurring_interval
      : oldSub.price?.recurring_interval;
    const oldRecurringInterval: OldSubscriptionInfo['recurringInterval'] =
      (recurringIntervalRaw as OldSubscriptionInfo['recurringInterval']) ||
      'month';

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
      metadata: oldSub.metadata ?? {},
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
    oldSub: {
      id: string;
      organization_id: string;
      stripe_subscription_id: string | null;
      current_period_end: string | null;
    },
    stripeAccountId?: string,
  ): Promise<Date | undefined> {
    const dbPeriodEnd = oldSub.current_period_end
      ? new Date(oldSub.current_period_end)
      : undefined;

    if (!oldSub.stripe_subscription_id || !stripeAccountId) {
      return dbPeriodEnd;
    }

    try {
      const stripeSub = await this.stripeService
        .getClient()
        .subscriptions.retrieve(oldSub.stripe_subscription_id, {
          stripeAccount: stripeAccountId,
        });
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
            .eq('id', oldSub.id)
            .eq('organization_id', oldSub.organization_id);
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
