import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Handle incoming Stripe webhook events
   */
  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'account.updated':
        await this.handleAccountUpdated(event.data.object);
        break;

      case 'account.external_account.created':
      case 'account.external_account.updated':
      case 'account.external_account.deleted':
        await this.handleAccountUpdated(event.account as string);
        break;

      case 'identity.verification_session.verified':
      case 'identity.verification_session.requires_input':
      case 'identity.verification_session.canceled':
      case 'identity.verification_session.processing':
        await this.handleIdentityVerificationUpdated(event.data.object);
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  /**
   * Handle account.updated webhook
   * Syncs Stripe Connect account status to our database
   */
  private async handleAccountUpdated(
    accountOrId: Stripe.Account | string,
  ): Promise<void> {
    try {
      let stripeAccountId: string;

      if (typeof accountOrId === 'string') {
        stripeAccountId = accountOrId;
      } else {
        stripeAccountId = accountOrId.id;
      }

      this.logger.log(`Syncing account status for ${stripeAccountId}`);

      const supabase = this.supabaseService.getClient();

      // Get full account details if we only have ID
      let account: Stripe.Account;
      if (typeof accountOrId === 'string') {
        // We would need to fetch from Stripe, but for webhook we should have the object
        this.logger.warn('Received account ID instead of object in webhook');
        return;
      } else {
        account = accountOrId;
      }

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

      // Update organization status if account is fully enabled
      if (data && account.charges_enabled && account.payouts_enabled) {
        await this.updateOrganizationStatus(data.id, 'active');
      }
    } catch (error) {
      this.logger.error('Error handling account.updated:', error);
    }
  }

  /**
   * Handle identity verification webhook events
   */
  private async handleIdentityVerificationUpdated(
    session: Stripe.Identity.VerificationSession,
  ): Promise<void> {
    try {
      this.logger.log(
        `Identity verification updated: ${session.id} - ${session.status}`,
      );

      const supabase = this.supabaseService.getClient();

      // Map Stripe status to our status
      let verificationStatus: string;
      switch (session.status) {
        case 'verified':
          verificationStatus = 'verified';
          break;
        case 'requires_input':
          verificationStatus = 'failed';
          break;
        case 'canceled':
          verificationStatus = 'failed';
          break;
        case 'processing':
          verificationStatus = 'pending';
          break;
        default:
          verificationStatus = 'pending';
      }

      // Update user verification status
      const { error } = await supabase
        .from('users')
        .update({
          identity_verification_status: verificationStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('identity_verification_id', session.id);

      if (error) {
        this.logger.error(
          `Failed to update identity verification for session ${session.id}:`,
          error,
        );
        return;
      }

      this.logger.log(
        `Identity verification ${session.id} updated to ${verificationStatus}`,
      );
    } catch (error) {
      this.logger.error('Error handling identity verification:', error);
    }
  }

  /**
   * Update organization status based on account readiness
   */
  private async updateOrganizationStatus(
    accountId: string,
    status: string,
  ): Promise<void> {
    try {
      const supabase = this.supabaseService.getClient();

      const { error } = await supabase
        .from('organizations')
        .update({
          status,
          status_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId);

      if (error) {
        this.logger.error(`Failed to update organization status:`, error);
      } else {
        this.logger.log(
          `Organization status updated to ${status} for account ${accountId}`,
        );
      }
    } catch (error) {
      this.logger.error('Error updating organization status:', error);
    }
  }
}
