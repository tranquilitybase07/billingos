import { Injectable } from '@nestjs/common';
import { BillingContext } from '../context/types';
import { EntitlementPlan } from './types';

/**
 * Plans entitlement changes (grant/revoke/swap) based on the billing context.
 * Does NOT execute — only builds the plan for Phase 4.
 */
@Injectable()
export class EntitlementPlanner {
  plan(ctx: BillingContext): EntitlementPlan {
    const now = new Date();
    const periodEnd = this.calculatePeriodEnd(
      now,
      ctx.price.recurringInterval,
      ctx.price.recurringIntervalCount,
    );

    // In-place upgrade: swap features on the existing subscription
    if (ctx.isInPlaceUpgrade && ctx.transition) {
      return {
        grant: null,
        revoke: null,
        swap: {
          subscriptionId: ctx.transition.oldSubscription.id,
          customerId: ctx.customer.id,
          newProductId: ctx.product.id,
          periodStart: now,
          periodEnd,
        },
      };
    }

    // New subscription (with or without transition)
    const grant = {
      productId: ctx.product.id,
      subscriptionId: undefined, // Set after subscription creation in Phase 4
      customerId: ctx.customer.id,
      periodStart: now,
      periodEnd,
    };

    // Transition: revoke old subscription features
    let revoke: EntitlementPlan['revoke'] = null;
    if (ctx.transition) {
      const shouldRevokeNow =
        ctx.transition.type === 'upgrade' ||
        ctx.transition.type === 'swap' ||
        // Downgrade of trialing/past_due/already-canceling → revoke now
        (ctx.transition.type === 'downgrade' &&
          (ctx.transition.oldSubscription.status === 'trialing' ||
            ctx.transition.oldSubscription.status === 'past_due' ||
            ctx.transition.oldSubscription.cancelAtPeriodEnd));

      if (shouldRevokeNow) {
        revoke = { subscriptionId: ctx.transition.oldSubscription.id };
      }
      // For healthy active downgrades: don't revoke yet.
      // Features stay active until period end; subscription.deleted webhook revokes.
    }

    return { grant, revoke, swap: null };
  }

  private calculatePeriodEnd(
    start: Date,
    interval: string,
    intervalCount: number,
  ): Date {
    const end = new Date(start);
    switch (interval) {
      case 'day':
        end.setDate(end.getDate() + intervalCount);
        break;
      case 'week':
        end.setDate(end.getDate() + 7 * intervalCount);
        break;
      case 'month':
        end.setMonth(end.getMonth() + intervalCount);
        break;
      case 'year':
        end.setFullYear(end.getFullYear() + intervalCount);
        break;
      default:
        end.setMonth(end.getMonth() + 1);
    }
    return end;
  }
}
