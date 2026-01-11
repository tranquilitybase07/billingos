import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from './stripe.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
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

      // Subscription events
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;

      // Invoice events
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object);
        break;

      // Entitlements events (cast to string to bypass TypeScript type checking)
      case 'entitlements.active_entitlement.created' as Stripe.Event.Type:
        await this.handleActiveEntitlementCreated(
          event.data.object as unknown as Stripe.Entitlements.ActiveEntitlement,
        );
        break;

      case 'entitlements.active_entitlement.updated' as Stripe.Event.Type:
        await this.handleActiveEntitlementUpdated(
          event.data.object as unknown as Stripe.Entitlements.ActiveEntitlement,
        );
        break;

      case 'entitlements.active_entitlement.deleted' as Stripe.Event.Type:
        await this.handleActiveEntitlementDeleted(
          event.data.object as unknown as Stripe.Entitlements.ActiveEntitlement,
        );
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

  /**
   * Handle customer.subscription.created webhook
   * Cache subscription in database (may already be there from API)
   */
  private async handleSubscriptionCreated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    try {
      this.logger.log(
        `Subscription created: ${subscription.id} for customer ${subscription.customer}`,
      );

      const supabase = this.supabaseService.getClient();

      // Check if subscription already exists (created via API)
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .single();

      if (existing) {
        this.logger.log(
          `Subscription ${subscription.id} already exists in database`,
        );
        return;
      }

      // Subscription was created outside our API (e.g., Stripe Dashboard)
      // For now, just log it. In production, you might want to create it in DB
      this.logger.warn(
        `Subscription ${subscription.id} was created outside the API - not automatically synced`,
      );
    } catch (error) {
      this.logger.error('Error handling subscription.created:', error);
    }
  }

  /**
   * Handle customer.subscription.updated webhook
   * Sync subscription status and check for period changes
   */
  private async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    try {
      this.logger.log(
        `Subscription updated: ${subscription.id} - status: ${subscription.status}`,
      );

      const supabase = this.supabaseService.getClient();

      // Get existing subscription
      const { data: existing, error: fetchError } = await supabase
        .from('subscriptions')
        .select('id, current_period_start, current_period_end')
        .eq('stripe_subscription_id', subscription.id)
        .single();

      if (fetchError || !existing) {
        this.logger.warn(
          `Subscription ${subscription.id} not found in database`,
        );
        return;
      }

      // Check if billing period changed (renewal)
      const subData = subscription as any;
      const newPeriodStart = subData.current_period_start
        ? new Date(subData.current_period_start * 1000)
        : null;
      const newPeriodEnd = subData.current_period_end
        ? new Date(subData.current_period_end * 1000)
        : null;
      const existingPeriodStart = existing.current_period_start
        ? new Date(existing.current_period_start)
        : null;

      const periodChanged =
        newPeriodStart &&
        existingPeriodStart &&
        newPeriodStart.getTime() !== existingPeriodStart.getTime();

      // Update subscription in database
      const updateData: any = {
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
      };

      if (newPeriodStart) {
        updateData.current_period_start = newPeriodStart.toISOString();
      }

      if (newPeriodEnd) {
        updateData.current_period_end = newPeriodEnd.toISOString();
      }

      if (subscription.canceled_at) {
        updateData.canceled_at = new Date(
          subscription.canceled_at * 1000,
        ).toISOString();
      }

      const { error: updateError } = await supabase
        .from('subscriptions')
        .update(updateData)
        .eq('id', existing.id);

      if (updateError) {
        this.logger.error(
          `Failed to update subscription ${subscription.id}:`,
          updateError,
        );
        return;
      }

      // If period changed, create new usage records
      if (periodChanged) {
        this.logger.log(
          `Billing period changed for subscription ${subscription.id} - creating new usage records`,
        );

        await this.subscriptionsService.handleRenewal(
          existing.id,
          newPeriodStart,
          new Date(subData.current_period_end * 1000),
        );
      }

      this.logger.log(`Subscription ${subscription.id} updated successfully`);
    } catch (error) {
      this.logger.error('Error handling subscription.updated:', error);
    }
  }

  /**
   * Handle customer.subscription.deleted webhook
   * Mark subscription as canceled and revoke features
   */
  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    try {
      this.logger.log(`Subscription deleted: ${subscription.id}`);

      const supabase = this.supabaseService.getClient();

      // Get subscription ID
      const { data: existing, error: fetchError } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .single();

      if (fetchError || !existing) {
        this.logger.warn(
          `Subscription ${subscription.id} not found in database`,
        );
        return;
      }

      // Update subscription status
      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      // Revoke all feature grants
      await supabase
        .from('feature_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('subscription_id', existing.id)
        .is('revoked_at', null);

      this.logger.log(
        `Subscription ${subscription.id} canceled and features revoked`,
      );
    } catch (error) {
      this.logger.error('Error handling subscription.deleted:', error);
    }
  }

  /**
   * Handle invoice.payment_succeeded webhook
   * Update subscription status to active
   */
  private async handleInvoicePaymentSucceeded(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    try {
      const invoiceData = invoice as any;
      if (!invoiceData.subscription) return;

      this.logger.log(
        `Invoice payment succeeded: ${invoice.id} for subscription ${invoiceData.subscription}`,
      );

      const supabase = this.supabaseService.getClient();

      // Update subscription status to active
      await supabase
        .from('subscriptions')
        .update({ status: 'active' })
        .eq('stripe_subscription_id', invoiceData.subscription);

      this.logger.log(
        `Subscription ${invoiceData.subscription} marked as active`,
      );
    } catch (error) {
      this.logger.error('Error handling invoice.payment_succeeded:', error);
    }
  }

  /**
   * Handle invoice.payment_failed webhook
   * Update subscription status to past_due
   */
  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    try {
      const invoiceData = invoice as any;
      if (!invoiceData.subscription) return;

      this.logger.warn(
        `Invoice payment failed: ${invoice.id} for subscription ${invoiceData.subscription}`,
      );

      const supabase = this.supabaseService.getClient();

      // Update subscription status to past_due
      await supabase
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('stripe_subscription_id', invoiceData.subscription);

      this.logger.log(
        `Subscription ${invoiceData.subscription} marked as past_due`,
      );

      // TODO: Notify customer about failed payment
    } catch (error) {
      this.logger.error('Error handling invoice.payment_failed:', error);
    }
  }

  /**
   * Handle entitlements.active_entitlement.created webhook
   * Sync new Active Entitlement to feature_grants table
   */
  private async handleActiveEntitlementCreated(
    activeEntitlement: Stripe.Entitlements.ActiveEntitlement,
  ): Promise<void> {
    try {
      // Cast to any to access customer property (not in official types yet)
      const entitlement = activeEntitlement as any;

      this.logger.log(
        `Active Entitlement created: ${entitlement.id} for customer ${entitlement.customer}`,
      );

      const supabase = this.supabaseService.getClient();

      // Get feature ID from Stripe feature
      const stripeFeatureId =
        typeof entitlement.feature === 'string'
          ? entitlement.feature
          : entitlement.feature.id;

      // Find local feature by stripe_feature_id
      const { data: localFeature } = await supabase
        .from('features')
        .select('id, organization_id')
        .eq('stripe_feature_id', stripeFeatureId)
        .single();

      if (!localFeature) {
        this.logger.warn(
          `Feature not found for stripe_feature_id: ${stripeFeatureId}`,
        );
        return;
      }

      // Find customer by stripe_customer_id
      const stripeCustomerId =
        typeof entitlement.customer === 'string'
          ? entitlement.customer
          : entitlement.customer.id;

      const { data: customer } = await supabase
        .from('customers')
        .select('id, organization_id')
        .eq('stripe_customer_id', stripeCustomerId)
        .single();

      if (!customer) {
        this.logger.warn(
          `Customer not found for stripe_customer_id: ${stripeCustomerId}`,
        );
        return;
      }

      // Find the subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('customer_id', customer.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Check if feature_grant already exists
      const { data: existingGrant } = await supabase
        .from('feature_grants')
        .select('id')
        .eq('stripe_active_entitlement_id', entitlement.id)
        .single();

      if (existingGrant) {
        this.logger.log(
          `Feature grant already exists for Active Entitlement ${entitlement.id}`,
        );
        return;
      }

      // Create feature_grant
      const insertData: any = {
        customer_id: customer.id,
        feature_id: localFeature.id,
        stripe_active_entitlement_id: entitlement.id,
        stripe_synced_at: new Date().toISOString(),
        stripe_sync_status: 'synced',
        granted_at: new Date().toISOString(),
      };

      if (subscription?.id) {
        insertData.subscription_id = subscription.id;
      }

      const { data: grant, error: grantError } = await supabase
        .from('feature_grants')
        .insert(insertData)
        .select()
        .single();

      if (grantError || !grant) {
        this.logger.error(
          `Failed to create feature_grant for Active Entitlement ${entitlement.id}:`,
          grantError,
        );
        return;
      }

      // Log sync event
      await supabase.from('stripe_sync_events').insert({
        organization_id: customer.organization_id,
        entity_type: 'feature_grant',
        entity_id: grant.id,
        stripe_object_id: entitlement.id,
        operation: 'create',
        status: 'success',
        triggered_by: 'webhook',
      });

      this.logger.log(
        `Feature grant created: ${grant.id} for Active Entitlement ${entitlement.id}`,
      );
    } catch (error) {
      this.logger.error(
        'Error handling entitlements.active_entitlement.created:',
        error,
      );
    }
  }

  /**
   * Handle entitlements.active_entitlement.updated webhook
   * Update existing feature_grant with changed entitlement data
   */
  private async handleActiveEntitlementUpdated(
    activeEntitlement: Stripe.Entitlements.ActiveEntitlement,
  ): Promise<void> {
    try {
      // Cast to any to access customer property (not in official types yet)
      const entitlement = activeEntitlement as any;

      this.logger.log(
        `Active Entitlement updated: ${entitlement.id} for customer ${entitlement.customer}`,
      );

      const supabase = this.supabaseService.getClient();

      // Find existing feature_grant by stripe_active_entitlement_id
      const { data: existingGrant } = await supabase
        .from('feature_grants')
        .select('id, customer_id, customers!inner(organization_id)')
        .eq('stripe_active_entitlement_id', entitlement.id)
        .single();

      if (!existingGrant) {
        this.logger.warn(
          `Feature grant not found for Active Entitlement ${entitlement.id}, creating new one`,
        );
        // If not found, treat as create
        await this.handleActiveEntitlementCreated(activeEntitlement);
        return;
      }

      // Update the feature_grant
      const { error: updateError } = await supabase
        .from('feature_grants')
        .update({
          stripe_synced_at: new Date().toISOString(),
          stripe_sync_status: 'synced',
        })
        .eq('id', existingGrant.id);

      if (updateError) {
        this.logger.error(
          `Failed to update feature_grant ${existingGrant.id}:`,
          updateError,
        );
        return;
      }

      // Log sync event
      await supabase.from('stripe_sync_events').insert({
        organization_id: (existingGrant as any).customers.organization_id,
        entity_type: 'feature_grant',
        entity_id: existingGrant.id,
        stripe_object_id: entitlement.id,
        operation: 'update',
        status: 'success',
        triggered_by: 'webhook',
      });

      this.logger.log(
        `Feature grant updated: ${existingGrant.id} for Active Entitlement ${entitlement.id}`,
      );
    } catch (error) {
      this.logger.error(
        'Error handling entitlements.active_entitlement.updated:',
        error,
      );
    }
  }

  /**
   * Handle entitlements.active_entitlement.deleted webhook
   * Mark feature_grant as revoked when entitlement deleted
   */
  private async handleActiveEntitlementDeleted(
    activeEntitlement: Stripe.Entitlements.ActiveEntitlement,
  ): Promise<void> {
    try {
      // Cast to any to access customer property (not in official types yet)
      const entitlement = activeEntitlement as any;

      this.logger.log(
        `Active Entitlement deleted: ${entitlement.id} for customer ${entitlement.customer}`,
      );

      const supabase = this.supabaseService.getClient();

      // Find existing feature_grant by stripe_active_entitlement_id
      const { data: existingGrant } = await supabase
        .from('feature_grants')
        .select('id, customer_id, customers!inner(organization_id)')
        .eq('stripe_active_entitlement_id', entitlement.id)
        .is('revoked_at', null)
        .single();

      if (!existingGrant) {
        this.logger.warn(
          `Feature grant not found for Active Entitlement ${entitlement.id}`,
        );
        return;
      }

      // Revoke the feature_grant
      const { error: revokeError } = await supabase
        .from('feature_grants')
        .update({
          revoked_at: new Date().toISOString(),
          stripe_synced_at: new Date().toISOString(),
          stripe_sync_status: 'synced',
        })
        .eq('id', existingGrant.id);

      if (revokeError) {
        this.logger.error(
          `Failed to revoke feature_grant ${existingGrant.id}:`,
          revokeError,
        );
        return;
      }

      // Log sync event
      await supabase.from('stripe_sync_events').insert({
        organization_id: (existingGrant as any).customers.organization_id,
        entity_type: 'feature_grant',
        entity_id: existingGrant.id,
        stripe_object_id: entitlement.id,
        operation: 'delete',
        status: 'success',
        triggered_by: 'webhook',
      });

      this.logger.log(
        `Feature grant revoked: ${existingGrant.id} for Active Entitlement ${entitlement.id}`,
      );
    } catch (error) {
      this.logger.error(
        'Error handling entitlements.active_entitlement.deleted:',
        error,
      );
    }
  }
}
