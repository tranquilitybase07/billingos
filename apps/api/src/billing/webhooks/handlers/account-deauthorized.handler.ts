import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WebhookContext, WebhookHandler } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';

/**
 * Handles account.application.deauthorized events.
 * When a connected account disconnects from the platform,
 * marks the account and organization as blocked.
 */
@Injectable()
export class AccountDeauthorizedHandler
  implements WebhookHandler, OnModuleInit
{
  private readonly logger = new Logger(AccountDeauthorizedHandler.name);

  constructor(private readonly router: WebhookRouter) {}

  onModuleInit(): void {
    this.router.registerHandler('account.application.deauthorized', this);
  }

  async handle(ctx: WebhookContext): Promise<void> {
    try {
      const accountId = ctx.event.account as string;
      await this.handleAccountDeauthorized(ctx, accountId);
    } catch (error) {
      this.logger.error(
        'Error in AccountDeauthorizedHandler:',
        error,
      );
    }
  }

  private async handleAccountDeauthorized(
    ctx: WebhookContext,
    accountId: string,
  ): Promise<void> {
    try {
      this.logger.warn(
        `Account deauthorized: ${accountId} - disconnecting from platform`,
      );

      const supabase = ctx.supabase;

      // Update account status to blocked
      const { data, error } = await supabase
        .from('accounts')
        .update({
          status: 'blocked',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_id', accountId)
        .select()
        .single();

      if (error || !data) {
        this.logger.error(
          `Failed to update deauthorized account ${accountId}:`,
          error,
        );
        return;
      }

      // Update organization status to blocked
      await this.updateOrganizationStatus(ctx, data.id, 'blocked', false);

      this.logger.log(`Account ${accountId} marked as deauthorized/blocked`);
    } catch (error) {
      this.logger.error(
        'Error handling account.application.deauthorized:',
        error,
      );
    }
  }

  /**
   * Update organization status based on account readiness
   */
  private async updateOrganizationStatus(
    ctx: WebhookContext,
    accountId: string,
    status: string,
    setOnboardedAt: boolean = false,
  ): Promise<void> {
    try {
      const supabase = ctx.supabase;

      const updateData: any = {
        status,
        status_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Set onboarded_at when account becomes active
      if (setOnboardedAt && status === 'active') {
        updateData.onboarded_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('organizations')
        .update(updateData)
        .eq('account_id', accountId);

      if (error) {
        this.logger.error(`Failed to update organization status:`, error);
      } else {
        this.logger.log(
          `Organization status updated to ${status} for account ${accountId}${setOnboardedAt ? ' (onboarded)' : ''}`,
        );
      }
    } catch (error) {
      this.logger.error('Error updating organization status:', error);
    }
  }
}
