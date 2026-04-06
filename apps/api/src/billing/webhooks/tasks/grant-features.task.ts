import { Logger } from '@nestjs/common';
import { WebhookContext, WebhookTask, SubscriptionUpdatedData } from '../webhook.types';

/**
 * Placeholder task to ensure features are granted after a subscription
 * status change.
 *
 * Currently subscription.updated does not need to re-grant features
 * (feature grants are created at subscription creation or checkout completion).
 * This task exists as a placeholder for future scenarios where status
 * transitions (e.g., incomplete -> active) should trigger feature grants.
 */
export class GrantFeaturesTask implements WebhookTask<SubscriptionUpdatedData> {
  readonly name = 'GrantFeatures';
  private readonly logger = new Logger(GrantFeaturesTask.name);

  async execute(_ctx: WebhookContext, data: SubscriptionUpdatedData): Promise<void> {
    // No-op for subscription.updated — features are granted at creation time.
    // This task is a placeholder for future logic such as:
    //  - Re-granting after a failed payment is retried successfully
    //  - Adjusting grants when the product changes in-place
    this.logger.debug(
      `GrantFeatures task: no action needed for subscription ${data.stripeSub.id}`,
    );
  }
}
