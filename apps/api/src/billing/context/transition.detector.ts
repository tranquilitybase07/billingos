import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
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
   */
  async detect(
    customerId: string,
    newProductId: string,
    newPriceAmount: number,
    explicitExistingSubId?: string,
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
    };

    const oldPeriodEnd =
      type === 'downgrade' && oldSub.current_period_end
        ? new Date(oldSub.current_period_end)
        : undefined;

    this.logger.log(
      `Transition detected: ${type} (old=${oldAmount} → new=${newPriceAmount}) ` +
        `for subscription ${oldSub.id}`,
    );

    return { type, oldSubscription, oldPeriodEnd };
  }

  constructor(private readonly supabaseService: SupabaseService) {}
}
