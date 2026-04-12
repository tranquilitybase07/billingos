import { Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { SubscriptionsService } from '../../../subscriptions/subscriptions.service';
import {
  WebhookContext,
  WebhookTask,
  SubscriptionUpdatedData,
} from '../webhook.types';

/**
 * Detect billing-period changes (renewals) and create new usage records.
 *
 * When the subscription's current_period_start advances, the billing
 * cycle has renewed. This task delegates to SubscriptionsService.handleRenewal()
 * which resets quota usage counters for the new period.
 */
export class HandleRenewalTask implements WebhookTask<SubscriptionUpdatedData> {
  readonly name = 'HandleRenewal';
  private readonly logger = new Logger(HandleRenewalTask.name);

  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async execute(
    ctx: WebhookContext,
    data: SubscriptionUpdatedData,
  ): Promise<void> {
    if (!data.periodChanged) {
      return;
    }

    const subData = data.stripeSub as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
    };

    const newPeriodStart = subData.current_period_start
      ? new Date(subData.current_period_start * 1000)
      : null;
    const newPeriodEnd = subData.current_period_end
      ? new Date(subData.current_period_end * 1000)
      : null;

    if (!newPeriodStart || !newPeriodEnd) {
      this.logger.warn(
        `Period changed but could not resolve period dates for subscription ${data.stripeSub.id}`,
      );
      return;
    }

    this.logger.log(
      `Billing period changed for subscription ${data.stripeSub.id} - creating new usage records`,
    );

    await this.subscriptionsService.handleRenewal(
      data.existing.id,
      newPeriodStart,
      newPeriodEnd,
    );
  }
}
