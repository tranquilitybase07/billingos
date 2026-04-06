import { Injectable, Logger } from '@nestjs/common';
import { EntitlementService } from '../entitlements/entitlement.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { EntitlementPlan } from '../plan/types';

/**
 * Phase 4b: Executes entitlement changes (grant/revoke/swap).
 *
 * Delegates to the unified EntitlementService from Phase 1.
 * Handles setting the subscriptionId on grant plans after
 * the subscription is created.
 */
@Injectable()
export class EntitlementExecutor {
  private readonly logger = new Logger(EntitlementExecutor.name);

  constructor(
    private readonly entitlementService: EntitlementService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async execute(
    plan: EntitlementPlan,
    /** The BOS subscription ID — set after subscription creation */
    subscriptionId?: string,
  ): Promise<void> {
    // 1. Revoke old features (transition)
    if (plan.revoke) {
      await this.subscriptionsService.revokeSubscriptionFeatures(
        plan.revoke.subscriptionId,
      );
      this.logger.log(
        `Revoked features for subscription ${plan.revoke.subscriptionId}`,
      );
    }

    // 2. Swap features (in-place upgrade)
    if (plan.swap) {
      await this.entitlementService.swapForSubscription({
        subscriptionId: plan.swap.subscriptionId,
        customerId: plan.swap.customerId,
        newProductId: plan.swap.newProductId,
        periodStart: plan.swap.periodStart,
        periodEnd: plan.swap.periodEnd,
      });
      this.logger.log(
        `Swapped features for subscription ${plan.swap.subscriptionId} to product ${plan.swap.newProductId}`,
      );
    }

    // 3. Grant new features
    if (plan.grant && subscriptionId) {
      await this.entitlementService.grantForSubscription({
        subscriptionId,
        customerId: plan.grant.customerId,
        productId: plan.grant.productId,
        periodStart: plan.grant.periodStart,
        periodEnd: plan.grant.periodEnd,
      });
      this.logger.log(
        `Granted features for subscription ${subscriptionId}, product ${plan.grant.productId}`,
      );
    }
  }
}
