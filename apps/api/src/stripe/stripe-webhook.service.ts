import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from './stripe.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { RedisService } from '../redis/redis.service';
import { RefundService } from './refund.service';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);
  private readonly IDEMPOTENCY_TTL_MS = 300000; // 5 minutes

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly redisService: RedisService,
    private readonly refundService: RefundService,
  ) {}

  /**
   * Handle incoming Stripe webhook events
   */
  async handleEvent(event: Stripe.Event): Promise<void> {
    // Log event type and livemode
    this.logger.log(
      `Processing webhook event: ${event.type} (livemode: ${event.livemode}, id: ${event.id})`,
    );

    // Redis-based idempotency check (Autum pattern)
    // Key includes event ID and environment (livemode)
    const idempotencyKey = `stripe:webhook:${event.livemode ? 'live' : 'test'}:${event.id}`;
    const isFirstRequest = await this.redisService.setIdempotencyKey(
      idempotencyKey,
      Date.now().toString(),
      this.IDEMPOTENCY_TTL_MS,
    );

    if (!isFirstRequest) {
      this.logger.warn(
        `Duplicate webhook event ${event.id} detected via Redis idempotency. Skipping.`,
      );
      return;
    }

    const supabase = this.supabaseService.getClient();

    // Secondary database check (for audit trail and Redis failure scenarios)
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id, status')
      .eq('event_id', event.id)
      .single();

    if (existingEvent) {
      this.logger.warn(
        `Duplicate webhook event ${event.id} found in database - already ${existingEvent.status}. Skipping.`,
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

      // Payment Intent events
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object);
        break;

      // Customer events
      case 'customer.created':
        await this.handleCustomerCreated(event.data.object);
        break;

      case 'customer.updated':
        await this.handleCustomerUpdated(event.data.object);
        break;

      case 'customer.deleted':
        await this.handleCustomerDeleted(event.data.object);
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

      // Invalidate product revenue metrics cache
      // Get the product_id from the subscription
      const { data: subscriptionData } = await supabase
        .from('subscriptions')
        .select('product_id')
        .eq('id', existing.id)
        .single();

      if (subscriptionData?.product_id) {
        const cacheKey = `product-metrics:${subscriptionData.product_id}`;
        await this.cacheManager.del(cacheKey);
        this.logger.debug(`Invalidated cache for product ${subscriptionData.product_id} after subscription update`);
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

      // Get subscription ID and product_id
      const { data: existing, error: fetchError } = await supabase
        .from('subscriptions')
        .select('id, product_id')
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

      // Invalidate product revenue metrics cache
      if (existing.product_id) {
        const cacheKey = `product-metrics:${existing.product_id}`;
        await this.cacheManager.del(cacheKey);
        this.logger.debug(`Invalidated cache for product ${existing.product_id} after subscription cancellation`);
      }

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
        .select('id, organization_id, properties')
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

  /**
   * Handle customer.created webhook
   * Sync new customer from Stripe to database (if not already exists)
   */
  private async handleCustomerCreated(customer: Stripe.Customer): Promise<void> {
    try {
      this.logger.log(`Customer created in Stripe: ${customer.id}`);

      const supabase = this.supabaseService.getClient();

      // Check if customer already exists (created via API)
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('stripe_customer_id', customer.id)
        .single();

      if (existing) {
        this.logger.log(`Customer ${customer.id} already exists in database`);
        return;
      }

      // Customer was created outside our API (e.g., Stripe Dashboard)
      // For now, just log it. In production, you might want to create it in DB
      this.logger.warn(
        `Customer ${customer.id} was created outside the API - not automatically synced`,
      );
    } catch (error) {
      this.logger.error('Error handling customer.created:', error);
    }
  }

  /**
   * Handle customer.updated webhook
   * Sync customer updates from Stripe to database
   */
  private async handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
    try {
      this.logger.log(`Customer updated in Stripe: ${customer.id}`);

      const supabase = this.supabaseService.getClient();

      // Find customer by stripe_customer_id
      const { data: existingCustomer, error: fetchError } = await supabase
        .from('customers')
        .select('id, email')
        .eq('stripe_customer_id', customer.id)
        .single();

      if (fetchError || !existingCustomer) {
        this.logger.warn(`Customer ${customer.id} not found in database`);
        return;
      }

      // Update customer with Stripe data
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (customer.email && customer.email !== existingCustomer.email) {
        updateData.email = customer.email.toLowerCase();
        // Note: Don't auto-verify email from Stripe
        updateData.email_verified = false;
      }

      if (customer.name) {
        updateData.name = customer.name;
      }

      if (customer.address) {
        updateData.billing_address = {
          street: customer.address.line1 || '',
          city: customer.address.city || '',
          state: customer.address.state || '',
          postal_code: customer.address.postal_code || '',
          country: customer.address.country || '',
        };
      }

      if (customer.metadata) {
        updateData.metadata = customer.metadata;

        // Sync external_id from metadata if present
        if (customer.metadata.external_id) {
          updateData.external_id = customer.metadata.external_id;
        }
      }

      const { error: updateError } = await supabase
        .from('customers')
        .update(updateData)
        .eq('id', existingCustomer.id);

      if (updateError) {
        this.logger.error(
          `Failed to update customer ${customer.id}:`,
          updateError,
        );
        return;
      }

      this.logger.log(`Customer ${customer.id} synced from Stripe`);
    } catch (error) {
      this.logger.error('Error handling customer.updated:', error);
    }
  }

  /**
   * Handle customer.deleted webhook
   * Soft delete customer in database
   */
  private async handleCustomerDeleted(customer: Stripe.Customer): Promise<void> {
    try {
      this.logger.log(`Customer deleted in Stripe: ${customer.id}`);

      const supabase = this.supabaseService.getClient();

      // Find customer
      const { data: existingCustomer, error: fetchError } = await supabase
        .from('customers')
        .select('id, organization_id')
        .eq('stripe_customer_id', customer.id)
        .is('deleted_at', null)
        .single();

      if (fetchError || !existingCustomer) {
        this.logger.warn(`Customer ${customer.id} not found in database`);
        return;
      }

      // Soft delete customer
      const { error: deleteError } = await supabase
        .from('customers')
        .update({
          deleted_at: new Date().toISOString(),
          external_id: null, // Clear external_id to allow reuse
        })
        .eq('id', existingCustomer.id);

      if (deleteError) {
        this.logger.error(
          `Failed to soft delete customer ${customer.id}:`,
          deleteError,
        );
        return;
      }

      // Cancel active subscriptions
      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          deleted_at: new Date().toISOString(),
        })
        .eq('customer_id', existingCustomer.id)
        .eq('status', 'active');

      // Revoke feature grants
      await supabase
        .from('feature_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('customer_id', existingCustomer.id)
        .is('revoked_at', null);

      this.logger.log(
        `Customer ${customer.id} soft deleted and related data cleaned up`,
      );
    } catch (error) {
      this.logger.error('Error handling customer.deleted:', error);
    }
  }

  /**
   * Handle payment_intent.succeeded webhook
   * Create customer and subscription after successful payment
   * Following the Flowglad/Autumn pattern: payment first, subscription after
   */
  private async handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    try {
      this.logger.log(`Payment intent succeeded: ${paymentIntent.id}`);

      const supabase = this.supabaseService.getClient();

      // Update payment intent status in database
      const { data: paymentIntentRecord, error: updateError } = await supabase
        .from('payment_intents')
        .update({
          status: paymentIntent.status,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', paymentIntent.id)
        .select()
        .single();

      if (updateError || !paymentIntentRecord) {
        this.logger.warn(
          `Payment intent ${paymentIntent.id} not found in database - may be from a different source`,
        );
        return;
      }

      // Mark checkout session as completed and fetch metadata
      const { data: checkoutSession } = await supabase
        .from('checkout_sessions')
        .update({
          completed_at: new Date().toISOString(),
        })
        .eq('payment_intent_id', paymentIntentRecord.id)
        .select()
        .single();

      // Extract metadata
      const metadata = paymentIntent.metadata || {};
      const organizationId = metadata.organizationId;
      const externalUserId = metadata.externalUserId;
      const productId = metadata.productId;
      const priceId = metadata.priceId;
      const trialDays = parseInt(metadata.trialDays || '0', 10);

      if (!organizationId || !productId || !priceId) {
        this.logger.error(
          'Missing required metadata in payment intent:',
          metadata,
        );
        return;
      }

      // Ensure customer exists with improved error handling
      let customerId = paymentIntentRecord.customer_id;
      const stripeCustomerId =
        typeof paymentIntent.customer === 'string'
          ? paymentIntent.customer
          : paymentIntent.customer?.id;

      if (!stripeCustomerId) {
        this.logger.error('No Stripe customer ID in payment intent');
        return;
      }

      // Upsert customer using consistent pattern
      if (!customerId) {
        const customerData = {
          organization_id: organizationId,
          stripe_customer_id: stripeCustomerId,
          external_id: externalUserId,
          email: metadata.customerEmail?.toLowerCase(),
          name: metadata.customerName,
          updated_at: new Date().toISOString(),
        };

        // Try upsert with retry logic
        let retries = 3;
        while (retries > 0) {
          const { data: customer, error: customerError } = await supabase
            .from('customers')
            .upsert(customerData, {
              onConflict: 'organization_id,stripe_customer_id',
              ignoreDuplicates: false,
            })
            .select()
            .single();

          if (!customerError) {
            customerId = customer.id;
            this.logger.log(`Customer ${customerId} upserted successfully`);
            break;
          }

          // Handle race condition with retry
          if (customerError.code === '23505' && retries > 1) {
            this.logger.warn(`Customer upsert conflict, retrying... (${retries - 1} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 100 * (4 - retries))); // Exponential backoff
            retries--;

            // Try to find existing customer
            const { data: existingCustomer } = await supabase
              .from('customers')
              .select('id')
              .eq('organization_id', organizationId)
              .eq('stripe_customer_id', stripeCustomerId)
              .single();

            if (existingCustomer) {
              customerId = existingCustomer.id;
              this.logger.log(`Found existing customer ${customerId}`);
              break;
            }
          } else {
            this.logger.error('Failed to create/find customer after retries:', customerError);
            return;
          }
        }

        // Update payment intent with customer ID
        await supabase
          .from('payment_intents')
          .update({ customer_id: customerId })
          .eq('id', paymentIntentRecord.id);
      }

      if (!customerId) {
        this.logger.error('Failed to ensure customer exists');
        return;
      }

      // Get organization's Stripe account
      const { data: organization } = await supabase
        .from('organizations')
        .select('accounts!inner(stripe_id)')
        .eq('id', organizationId)
        .single();

      if (!organization || !organization.accounts) {
        this.logger.error(
          `Organization ${organizationId} or its Stripe account not found`,
        );
        return;
      }

      const stripeAccountId = (organization.accounts as any).stripe_id;

      // Check for ANY existing subscription (including canceled/ended) for reactivation
      const { data: allSubscriptions } = await supabase
        .from('subscriptions')
        .select('id, stripe_subscription_id, status, created_at, price_id')
        .eq('customer_id', customerId)
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      let shouldCreateNewSubscription = true;
      let reactivatedSubscriptionId: string | null = null;

      if (allSubscriptions && allSubscriptions.length > 0) {
        // Check for active/trialing subscriptions first
        const activeSubscription = allSubscriptions.find(
          sub => ['active', 'trialing', 'incomplete', 'past_due'].includes(sub.status) &&
                 sub.stripe_subscription_id?.startsWith('sub_')
        );

        if (activeSubscription) {
          this.logger.log(
            `Subscription already exists for customer ${customerId} and product ${productId}: ${activeSubscription.id}`,
          );
          return; // Already has active subscription
        }

        // Check for canceled/ended subscriptions to reactivate
        const canceledSubscription = allSubscriptions.find(
          sub => ['canceled', 'ended'].includes(sub.status)
        );

        if (canceledSubscription) {
          this.logger.log(`Reactivating canceled subscription: ${canceledSubscription.id}`);

          // We need to create a NEW Stripe subscription (can't reuse canceled one)
          // But we'll update the existing database record
          shouldCreateNewSubscription = true;
          reactivatedSubscriptionId = canceledSubscription.id;
        }

        // Clean up any invalid subscription records
        const invalidSubs = allSubscriptions.filter(
          sub => sub.status === 'incomplete' &&
                 (!sub.stripe_subscription_id || !sub.stripe_subscription_id.startsWith('sub_'))
        );

        if (invalidSubs.length > 0) {
          this.logger.warn(
            `Found ${invalidSubs.length} invalid subscription(s). Will clean up.`,
          );

          for (const invalidSub of invalidSubs) {
            await supabase
              .from('subscriptions')
              .delete()
              .eq('id', invalidSub.id);

            this.logger.log(`Cleaned up invalid subscription ${invalidSub.id}`);
          }
        }
      }

      // Get price details
      const { data: price } = await supabase
        .from('product_prices')
        .select('stripe_price_id, price_amount, price_currency, recurring_interval, recurring_interval_count')
        .eq('id', priceId)
        .single();

      if (!price?.stripe_price_id) {
        this.logger.error(`Stripe price not found for ${priceId}`);
        return;
      }

      // CRITICAL: Attach payment method to customer before creating subscription
      if (paymentIntent.payment_method) {
        try {
          const paymentMethodId =
            typeof paymentIntent.payment_method === 'string'
              ? paymentIntent.payment_method
              : paymentIntent.payment_method.id;

          // Attach payment method to customer
          await this.stripeService.attachPaymentMethodToCustomer(
            paymentMethodId,
            stripeCustomerId,
            stripeAccountId,
          );

          // Set as default payment method
          await this.stripeService.updateCustomer(
            stripeCustomerId,
            {
              invoice_settings: {
                default_payment_method: paymentMethodId,
              },
            },
            stripeAccountId,
          );

          this.logger.log(`Payment method ${paymentMethodId} attached to customer ${stripeCustomerId}`);
        } catch (pmError) {
          this.logger.error('Failed to attach payment method:', pmError);
          // Continue anyway - subscription might still work
        }
      }

      // Create subscription with proper configuration
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: stripeCustomerId,
        items: [{ price: price.stripe_price_id }],
        payment_behavior: 'allow_incomplete', // Allow incomplete since payment already succeeded
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        metadata: {
          organizationId,
          customerId,
          productId,
          priceId,
          externalUserId,
        },
        expand: ['latest_invoice.payment_intent'],
      };

      // Check trial eligibility before granting trial (simple approach from Autum)
      let shouldGrantTrial = false;
      if (trialDays > 0) {
        // Check if customer has ever had a trial or subscription for this product
        const { data: trialEligible } = await supabase.rpc('check_trial_eligibility', {
          p_customer_id: customerId,
          p_product_id: productId,
        });

        if (trialEligible) {
          subscriptionParams.trial_period_days = trialDays;
          shouldGrantTrial = true;
          this.logger.log(`Granting ${trialDays}-day trial for customer ${customerId} on product ${productId}`);
        } else {
          this.logger.warn(`Trial not granted for customer ${customerId} - already had trial or subscription for product ${productId}`);
        }
      }

      // Set default payment method if available
      if (paymentIntent.payment_method) {
        const paymentMethodId =
          typeof paymentIntent.payment_method === 'string'
            ? paymentIntent.payment_method
            : paymentIntent.payment_method.id;
        subscriptionParams.default_payment_method = paymentMethodId;
      }

      // Cancel existing subscription if this is an upgrade/downgrade
      const checkoutMetadata = checkoutSession?.metadata as any;
      if (checkoutMetadata?.existingSubscriptionId) {
        this.logger.log(
          `This is an upgrade/downgrade. Canceling existing subscription: ${checkoutMetadata.existingSubscriptionId}`,
        );

        try {
          // Get the existing subscription
          const { data: existingSubscription } = await supabase
            .from('subscriptions')
            .select('id, stripe_subscription_id, status, metadata')
            .eq('id', checkoutMetadata.existingSubscriptionId)
            .single();

          if (existingSubscription) {
            // Cancel in Stripe if it has a Stripe subscription ID
            if (existingSubscription.stripe_subscription_id?.startsWith('sub_')) {
              try {
                await this.stripeService.cancelSubscription(
                  existingSubscription.stripe_subscription_id,
                  stripeAccountId,
                  false, // Cancel immediately, not at period end
                );
                this.logger.log(
                  `Canceled Stripe subscription immediately: ${existingSubscription.stripe_subscription_id}`,
                );
              } catch (stripeError) {
                this.logger.warn(
                  `Failed to cancel Stripe subscription ${existingSubscription.stripe_subscription_id}:`,
                  stripeError,
                );
                // Continue anyway - we'll mark it canceled in our database
              }
            }

            // Mark as canceled in our database
            await supabase
              .from('subscriptions')
              .update({
                status: 'canceled',
                canceled_at: new Date().toISOString(),
                cancel_at_period_end: false,
                updated_at: new Date().toISOString(),
                metadata: {
                  ...(existingSubscription.metadata as any || {}),
                  canceledReason: 'upgraded_or_downgraded',
                  newSubscriptionCheckoutSessionId: checkoutSession?.id,
                },
              })
              .eq('id', existingSubscription.id);

            this.logger.log(`Marked subscription ${existingSubscription.id} as canceled in database`);
          } else {
            this.logger.warn(
              `Existing subscription ${checkoutMetadata.existingSubscriptionId} not found`,
            );
          }
        } catch (error) {
          this.logger.error('Error canceling existing subscription:', error);
          // Continue anyway - we still want to create the new subscription
        }
      }

      // Create Stripe subscription
      let stripeSubscription;
      try {
        stripeSubscription = await this.stripeService.createSubscription(
          subscriptionParams,
          stripeAccountId,
        );
        this.logger.log(`Stripe subscription ${stripeSubscription.id} created`);
      } catch (subError) {
        this.logger.error('Failed to create Stripe subscription:', subError);
        return;
      }

      // Get customer's organization (already validated above)
      const { data: customer } = await supabase
        .from('customers')
        .select('organization_id')
        .eq('id', customerId)
        .single();

      if (!customer) {
        this.logger.error(`Customer ${customerId} not found in database after creation`);
        return;
      }

      // Prepare subscription data
      const subData = stripeSubscription as any;
      const subscriptionData = {
        customer_id: customerId,
        organization_id: customer.organization_id,
        product_id: productId,
        price_id: priceId,
        stripe_subscription_id: stripeSubscription.id,
        status: stripeSubscription.status,
        current_period_start: subData.current_period_start
          ? new Date(subData.current_period_start * 1000).toISOString()
          : new Date().toISOString(),
        current_period_end: subData.current_period_end
          ? new Date(subData.current_period_end * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        trial_end: subData.trial_end
          ? new Date(subData.trial_end * 1000).toISOString()
          : null,
        trial_start: subData.trial_start
          ? new Date(subData.trial_start * 1000).toISOString()
          : null,
        cancel_at_period_end: false,
        amount: price.price_amount || 0,
        currency: price.price_currency || 'usd',
        metadata: {
          payment_intent_id: paymentIntentRecord.id,
          created_from: 'payment_intent_succeeded',
        },
      };

      // Either update existing (reactivation) or create new subscription
      let subscription: any;
      let subError: any;

      if (reactivatedSubscriptionId) {
        // Reactivate existing subscription
        this.logger.log(`Updating subscription ${reactivatedSubscriptionId} with new Stripe subscription`);

        const { data, error } = await supabase
          .from('subscriptions')
          .update({
            ...subscriptionData,
            canceled_at: null,
            ended_at: null,
            metadata: {
              ...subscriptionData.metadata,
              reactivatedAt: new Date().toISOString(),
              previousCancellation: 'reactivated',
            },
          })
          .eq('id', reactivatedSubscriptionId)
          .select()
          .single();

        subscription = data;
        subError = error;

        if (!error) {
          this.logger.log(`Subscription ${reactivatedSubscriptionId} reactivated successfully`);
        }
      } else {
        // Create new subscription record
        const { data, error } = await supabase
          .from('subscriptions')
          .insert(subscriptionData)
          .select()
          .single();

        subscription = data;
        subError = error;
      }

      if (subError) {
        this.logger.error('Failed to save subscription to database:', subError);

        // CRITICAL: Refund the payment since we can't provide service
        await this.refundService.refundPaymentOnFailure({
          paymentIntentId: paymentIntent.id,
          stripeAccountId,
          reason: `subscription_creation_failed: ${subError.message}`,
        });

        // Cancel Stripe subscription if database save fails
        try {
          await this.stripeService.cancelSubscription(
            stripeSubscription.id,
            stripeAccountId,
          );
          this.logger.warn(`Cancelled Stripe subscription ${stripeSubscription.id} due to database error`);
        } catch (cancelError) {
          this.logger.error('Failed to cancel subscription after database error:', cancelError);
        }
        return;
      }

      this.logger.log(
        `Subscription ${subscription.id} created successfully for customer ${customerId}`,
      );

      // Invalidate product revenue metrics cache
      const cacheKey = `product-metrics:${productId}`;
      await this.cacheManager.del(cacheKey);
      this.logger.debug(`Invalidated cache for product ${productId} after subscription creation`);

      // Grant features with deduplication check
      const { data: productFeatures } = await supabase
        .from('product_features')
        .select('feature_id, config')
        .eq('product_id', productId);

      if (productFeatures && productFeatures.length > 0) {
        // Check for existing grants to avoid duplicates
        const { data: existingGrants } = await supabase
          .from('feature_grants')
          .select('feature_id')
          .eq('customer_id', customerId)
          .eq('subscription_id', subscription.id);

        const existingFeatureIds = new Set(existingGrants?.map(g => g.feature_id) || []);

        const newFeatureGrants = productFeatures
          .filter(pf => !existingFeatureIds.has(pf.feature_id))
          .map((pf) => ({
            customer_id: customerId,
            subscription_id: subscription.id,
            feature_id: pf.feature_id,
            properties: pf.config || {},
            granted_at: new Date().toISOString(),
          }));

        if (newFeatureGrants.length > 0) {
          const { error: grantError } = await supabase
            .from('feature_grants')
            .insert(newFeatureGrants);

          if (grantError) {
            this.logger.error('Failed to grant features:', grantError);
            // Don't fail the whole process - subscription is already created
          } else {
            this.logger.log(
              `Granted ${newFeatureGrants.length} features to customer ${customerId}`,
            );
          }
        } else {
          this.logger.log('All features already granted or no features to grant');
        }
      }

      // Update checkout session with subscription info
      await supabase
        .from('checkout_sessions')
        .update({
          subscription_id: subscription.id,
          updated_at: new Date().toISOString(),
        })
        .eq('payment_intent_id', paymentIntentRecord.id);

      this.logger.log(
        `Successfully completed subscription flow for payment intent ${paymentIntent.id}`,
      );
    } catch (error) {
      this.logger.error('Critical error in payment_intent.succeeded handler:', error);
      this.logger.error('Stack trace:', error.stack);
    }
  }

  /**
   * Handle payment_intent.payment_failed webhook
   * Update payment intent status and handle failure
   */
  private async handlePaymentIntentFailed(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    try {
      this.logger.warn(`Payment intent failed: ${paymentIntent.id}`);

      const supabase = this.supabaseService.getClient();

      // Update payment intent status in database
      const { error: updateError } = await supabase
        .from('payment_intents')
        .update({
          status: paymentIntent.status,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', paymentIntent.id);

      if (updateError) {
        this.logger.error(
          `Failed to update payment intent ${paymentIntent.id}:`,
          updateError,
        );
        return;
      }

      // TODO: Send failure notification to customer
      // This could be an email, in-app notification, etc.

      this.logger.log(
        `Payment intent ${paymentIntent.id} marked as failed`,
      );
    } catch (error) {
      this.logger.error('Error handling payment_intent.payment_failed:', error);
    }
  }
}
