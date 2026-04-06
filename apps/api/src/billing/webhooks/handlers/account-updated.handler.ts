import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookContext, WebhookHandler } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';
import { StripeService } from '../../../stripe/stripe.service';
import { getCurrencyForCountry } from '../../../common/constants/currencies';

/**
 * Handles account.updated and account.external_account.* events.
 * Syncs Stripe Connect account status to the database and updates
 * the associated organization's status and default currency.
 */
@Injectable()
export class AccountUpdatedHandler implements WebhookHandler, OnModuleInit {
  private readonly logger = new Logger(AccountUpdatedHandler.name);

  constructor(
    private readonly router: WebhookRouter,
    private readonly stripeService: StripeService,
  ) {}

  onModuleInit(): void {
    this.router.registerHandler(
      [
        'account.updated',
        'account.external_account.created',
        'account.external_account.updated',
        'account.external_account.deleted',
      ],
      this,
    );
  }

  async handle(ctx: WebhookContext): Promise<void> {
    try {
      switch (ctx.event.type) {
        case 'account.updated':
          await this.handleAccountUpdated(ctx, ctx.event.data.object);
          break;

        case 'account.external_account.created':
        case 'account.external_account.updated':
        case 'account.external_account.deleted':
          // External account events pass account ID as a string
          await this.handleAccountUpdated(ctx, ctx.event.account as string);
          break;

        default:
          this.logger.warn(`Unexpected event type: ${ctx.event.type}`);
      }
    } catch (error) {
      this.logger.error(
        `Error in AccountUpdatedHandler for ${ctx.event.type}:`,
        error,
      );
    }
  }

  private async handleAccountUpdated(
    ctx: WebhookContext,
    accountOrId: Stripe.Account | string,
  ): Promise<void> {
    try {
      let stripeAccountId: string;
      let account: Stripe.Account;

      if (typeof accountOrId === 'string') {
        // External account events pass account ID as string
        stripeAccountId = accountOrId;
        this.logger.log(
          `Fetching full account details for ${stripeAccountId} from Stripe`,
        );
        account = await this.stripeService.getConnectAccount(stripeAccountId);
      } else {
        // Regular account.updated event has full object
        account = accountOrId;
        stripeAccountId = account.id;
      }

      this.logger.log(`Syncing account status for ${stripeAccountId}`);

      const supabase = ctx.supabase;

      // Update account in database
      const { data, error } = await supabase
        .from('accounts')
        .update({
          is_details_submitted: account.details_submitted || false,
          is_charges_enabled: account.charges_enabled || false,
          is_payouts_enabled: account.payouts_enabled || false,
          business_type: account.business_type || null,
          email: account.email || null,
          country: account.country || 'US',
          currency: account.default_currency || null,
          data: account as any, // Store full Stripe account object
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_id', stripeAccountId)
        .select()
        .single();

      if (error) {
        this.logger.error(
          `Failed to update account ${stripeAccountId}:`,
          error,
        );
        return;
      }

      this.logger.log(`Account ${stripeAccountId} synced successfully`);

      // Update organization status based on account state
      if (data) {
        if (account.charges_enabled && account.payouts_enabled) {
          // Fully enabled - mark as active
          await this.updateOrganizationStatus(
            ctx,
            data.id,
            'active',
            true,
          );
        } else if (account.details_submitted) {
          // Details submitted but not fully enabled yet
          await this.updateOrganizationStatus(
            ctx,
            data.id,
            'onboarding_started',
            false,
          );
        }

        // Sync default_currency from Stripe country if org has no products yet
        if (account.country) {
          const { data: org } = await supabase
            .from('organizations')
            .select('id')
            .eq('account_id', data.id)
            .single();

          if (org) {
            const { count } = await supabase
              .from('products')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', org.id)
              .is('is_archived', false);

            if (count === 0) {
              await supabase
                .from('organizations')
                .update({
                  default_currency: getCurrencyForCountry(account.country),
                })
                .eq('id', org.id);

              this.logger.log(
                `Updated org ${org.id} default_currency to ${getCurrencyForCountry(account.country)} from Stripe country ${account.country}`,
              );
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Error handling account.updated:', error);
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
