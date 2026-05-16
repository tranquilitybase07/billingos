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
      this.logger.error('Error in AccountDeauthorizedHandler:', error);
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
      const now = new Date().toISOString();

      // Soft-delete the account row. Mirrors the user-initiated disconnect()
      // path so re-connecting the same Stripe account isn't blocked by dedup
      // (which filters on deleted_at IS NULL). Use maybeSingle() because the
      // row may already be soft-deleted (our own Disconnect fires Stripe's
      // deauth webhook as confirmation) or never tracked — both are no-ops.
      const { data, error } = await supabase
        .from('accounts')
        .update({
          status: 'blocked',
          deleted_at: now,
          updated_at: now,
        })
        .eq('stripe_id', accountId)
        .is('deleted_at', null)
        .select()
        .maybeSingle();

      if (error) {
        this.logger.error(
          `Failed to update deauthorized account ${accountId}:`,
          error,
        );
        return;
      }

      if (!data) {
        this.logger.log(
          `Deauthorize webhook for ${accountId}: no active account row — already disconnected from BOS, skipping`,
        );
        return;
      }

      // Unlink the org and revert it to 'created' so the user can re-connect.
      const { error: orgErr } = await supabase
        .from('organizations')
        .update({
          account_id: null,
          status: 'created',
          status_updated_at: now,
          updated_at: now,
        })
        .eq('account_id', data.id);

      if (orgErr) {
        this.logger.error(
          `Failed to unlink organization for deauthorized account ${data.id}:`,
          orgErr,
        );
      }

      this.logger.log(
        `Account ${accountId} soft-deleted and org unlinked (deauthorized)`,
      );
    } catch (error) {
      this.logger.error(
        'Error handling account.application.deauthorized:',
        error,
      );
    }
  }

}
