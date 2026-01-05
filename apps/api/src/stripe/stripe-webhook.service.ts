import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from './stripe.service';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Handle incoming Stripe webhook events
   */
  async handleEvent(event: Stripe.Event): Promise<void> {
    // Log event type and livemode
    this.logger.log(
      `Processing webhook event: ${event.type} (livemode: ${event.livemode}, id: ${event.id})`,
    );

    const supabase = this.supabaseService.getClient();

    // Check for duplicate events (idempotency)
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id, status')
      .eq('event_id', event.id)
      .single();

    if (existingEvent) {
      this.logger.warn(
        `Duplicate webhook event ${event.id} - already ${existingEvent.status}. Skipping.`,
      );
      return;
    }

    // Store webhook event for idempotency and audit trail
    const { error: insertError } = await supabase
      .from('webhook_events')
      .insert({
        event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        status: 'pending',
        payload: event as any,
        api_version: event.api_version,
        account_id: event.account || null,
      });

    if (insertError) {
      this.logger.error(
        `Failed to store webhook event ${event.id}:`,
        insertError,
      );
      // Continue processing even if storage fails (non-critical)
    }

    try {
      await this.processEvent(event);

      // Mark event as processed
      await supabase
        .from('webhook_events')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
        })
        .eq('event_id', event.id);
    } catch (error) {
      // Mark event as failed
      await supabase
        .from('webhook_events')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          retry_count: 1,
        })
        .eq('event_id', event.id);

      throw error; // Re-throw to return 500 to Stripe for retry
    }
  }

  /**
   * Process the webhook event based on type
   */
  private async processEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'account.updated':
        await this.handleAccountUpdated(event.data.object);
        break;

      case 'account.external_account.created':
      case 'account.external_account.updated':
      case 'account.external_account.deleted':
        await this.handleAccountUpdated(event.account as string);
        break;

      case 'account.application.deauthorized':
        await this.handleAccountDeauthorized(event.account as string);
        break;

      case 'identity.verification_session.verified':
      case 'identity.verification_session.requires_input':
      case 'identity.verification_session.canceled':
      case 'identity.verification_session.processing':
        await this.handleIdentityVerificationUpdated(event.data.object);
        break;

      case 'payout.failed':
        this.handlePayoutFailed(event.data.object);
        break;

      case 'payout.paid':
        this.handlePayoutPaid(event.data.object);
        break;

      case 'payout.updated':
        this.handlePayoutUpdated(event.data.object);
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

      const supabase = this.supabaseService.getClient();

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
          await this.updateOrganizationStatus(data.id, 'active', true);
        } else if (account.details_submitted) {
          // Details submitted but not fully enabled yet
          await this.updateOrganizationStatus(
            data.id,
            'onboarding_started',
            false,
          );
        }
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
   * Handle account.application.deauthorized webhook
   * When a connected account disconnects from the platform
   */
  private async handleAccountDeauthorized(accountId: string): Promise<void> {
    try {
      this.logger.warn(
        `Account deauthorized: ${accountId} - disconnecting from platform`,
      );

      const supabase = this.supabaseService.getClient();

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
      await this.updateOrganizationStatus(data.id, 'blocked', false);

      this.logger.log(`Account ${accountId} marked as deauthorized/blocked`);
    } catch (error) {
      this.logger.error(
        'Error handling account.application.deauthorized:',
        error,
      );
    }
  }

  /**
   * Handle payout.failed webhook
   * When a scheduled payout fails
   */
  private handlePayoutFailed(payout: Stripe.Payout): void {
    try {
      this.logger.error(
        // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
        `Payout failed: ${payout.id} for account ${payout.destination} - ${payout.failure_message || 'Unknown error'}`,
      );

      // const supabase = this.supabaseService.getClient();

      // Get account by Stripe account ID (payout.destination can be bank account ID or account ID)
      // For Connect accounts, we need to track which account this payout belongs to
      // This will be enhanced when we add a payouts table

      // For now, just log the failure
      // TODO: Create payouts table to track payout status
      this.logger.warn(
        `Payout tracking table not yet implemented. Failed payout: ${payout.id}`,
      );
    } catch (error) {
      this.logger.error('Error handling payout.failed:', error);
    }
  }

  /**
   * Handle payout.paid webhook
   * When a payout is successfully transferred
   */
  private handlePayoutPaid(payout: Stripe.Payout): void {
    try {
      this.logger.log(
        `Payout paid: ${payout.id} for ${payout.amount} ${payout.currency}`,
      );

      // TODO: Create payouts table to track payout status
      // For now, just log successful payouts
      this.logger.warn(
        `Payout tracking table not yet implemented. Paid payout: ${payout.id}`,
      );
    } catch (error) {
      this.logger.error('Error handling payout.paid:', error);
    }
  }

  /**
   * Handle payout.updated webhook
   * When payout status changes
   */
  private handlePayoutUpdated(payout: Stripe.Payout): void {
    try {
      this.logger.log(
        `Payout updated: ${payout.id} - status: ${payout.status}`,
      );

      // TODO: Create payouts table to track payout status changes
      this.logger.warn(
        `Payout tracking table not yet implemented. Updated payout: ${payout.id}`,
      );
    } catch (error) {
      this.logger.error('Error handling payout.updated:', error);
    }
  }

  /**
   * Update organization status based on account readiness
   */
  private async updateOrganizationStatus(
    accountId: string,
    status: string,
    setOnboardedAt: boolean = false,
  ): Promise<void> {
    try {
      const supabase = this.supabaseService.getClient();

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
