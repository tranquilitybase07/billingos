import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import Stripe from 'stripe';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../../../packages/shared/types/database';
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

      // Checkout Session events (adaptive pricing)
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object);
        break;

      // SetupIntent events (trial product checkouts)
      case 'setup_intent.succeeded':
        await this.handleSetupIntentSucceeded(event.data.object);
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

      // Refund events
      case 'charge.refunded':
        await this.handleChargeRefunded(event);
        break;

      case 'charge.refund.updated':
        await this.handleRefundUpdated(event);
        break;

      // Dispute events
      case 'charge.dispute.created':
        await this.handleDisputeCreated(event);
        break;

      case 'charge.dispute.closed':
        await this.handleDisputeClosed(event);
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
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id;
      this.logger.log(
        `Subscription created: ${subscription.id} for customer ${customerId}`,
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

      // Handle incomplete_expired — terminal state, revoke features and mark ended
      if (subscription.status === 'incomplete_expired') {
        this.logger.log(
          `Subscription ${subscription.id} reached incomplete_expired — revoking features`,
        );

        await supabase
          .from('subscriptions')
          .update({
            status: 'incomplete_expired',
            ended_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        await this.subscriptionsService.revokeSubscriptionFeatures(existing.id);

        // Invalidate cache
        const { data: subForCache } = await supabase
          .from('subscriptions')
          .select('product_id')
          .eq('id', existing.id)
          .single();

        if (subForCache?.product_id) {
          await this.cacheManager.del(
            `product-metrics:${subForCache.product_id}`,
          );
        }

        return;
      }

      // FIX 9: Fetch fresh subscription state from Stripe to prevent race conditions
      // Another webhook may have already processed a newer state
      let authoritativeSubscription = subscription;
      try {
        const stripeAccountId = (subscription as any).account || null;
        const freshSub = await this.stripeService
          .getClient()
          .subscriptions.retrieve(
            subscription.id,
            stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
          );
        authoritativeSubscription = freshSub;
        this.logger.debug(
          `Fresh Stripe status for ${subscription.id}: ${freshSub.status} (webhook had: ${subscription.status})`,
        );
      } catch (stripeError) {
        this.logger.warn(
          `Could not fetch fresh subscription ${subscription.id} from Stripe — using webhook status`,
          stripeError,
        );
      }

      // Check if billing period changed (renewal)
      const subData = authoritativeSubscription as any;
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

      // Update subscription in database using authoritative status
      const updateData: any = {
        status: authoritativeSubscription.status,
        cancel_at_period_end: authoritativeSubscription.cancel_at_period_end,
      };

      if (newPeriodStart) {
        updateData.current_period_start = newPeriodStart.toISOString();
      }

      if (newPeriodEnd) {
        updateData.current_period_end = newPeriodEnd.toISOString();
      }

      if (authoritativeSubscription.canceled_at) {
        updateData.canceled_at = new Date(
          authoritativeSubscription.canceled_at * 1000,
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
        this.logger.debug(
          `Invalidated cache for product ${subscriptionData.product_id} after subscription update`,
        );
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

      // Skip recently-created incomplete subscriptions — these are being canceled
      // and recreated during discount apply/remove in the checkout flow.
      // Older incomplete subscriptions (>5 min) should be processed normally.
      if (subscription.status === 'incomplete') {
        const createdAt = subscription.created
          ? new Date(subscription.created * 1000)
          : null;
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        if (createdAt && createdAt > fiveMinutesAgo) {
          this.logger.log(
            `Skipping deletion of recent incomplete subscription ${subscription.id} (likely recreated for discount)`,
          );
          return;
        }
        this.logger.log(
          `Processing deletion of stale incomplete subscription ${subscription.id}`,
        );
      }

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
        this.logger.debug(
          `Invalidated cache for product ${existing.product_id} after subscription cancellation`,
        );
      }

      // Revoke all feature grants
      await this.subscriptionsService.revokeSubscriptionFeatures(existing.id);

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

      // Check current subscription status before overriding
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('stripe_subscription_id', invoiceData.subscription)
        .single();

      if (!existing) {
        this.logger.warn(
          `Subscription ${invoiceData.subscription} not found in DB for invoice payment`,
        );
        return;
      }

      // Don't override trialing status — trial subscriptions use deferred billing
      if (existing.status === 'trialing') {
        this.logger.log(
          `Subscription ${invoiceData.subscription} is trialing — not overriding to active`,
        );
        return;
      }

      // Don't override if already active (handled by payment_intent.succeeded)
      if (existing.status === 'active') {
        this.logger.log(
          `Subscription ${invoiceData.subscription} already active — no update needed`,
        );
        return;
      }

      // Re-grant features if recovering from past_due (features were revoked on failure)
      if (existing.status === 'past_due') {
        const { data: fullSub } = await supabase
          .from('subscriptions')
          .select(
            'id, customer_id, product_id, current_period_start, current_period_end',
          )
          .eq('stripe_subscription_id', invoiceData.subscription)
          .single();

        if (fullSub) {
          await this.subscriptionsService.grantProductFeatures(
            fullSub.customer_id,
            fullSub.id,
            fullSub.product_id,
            new Date(fullSub.current_period_start),
            new Date(fullSub.current_period_end),
          );
          this.logger.log(
            `Re-granted features for subscription ${invoiceData.subscription} after payment recovery`,
          );
        }
      }

      // Update to active for other statuses (past_due, incomplete, etc.)
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
      const { data: pastDueSub } = await supabase
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('stripe_subscription_id', invoiceData.subscription)
        .select('id, customer_id, organization_id')
        .single();

      this.logger.log(
        `Subscription ${invoiceData.subscription} marked as past_due`,
      );

      // Revoke features on payment failure
      if (pastDueSub) {
        await this.subscriptionsService.revokeSubscriptionFeatures(
          pastDueSub.id,
        );

        // Insert payment failure notification into reconciliation queue
        await supabase.from('reconciliation_queue').insert({
          type: 'payment_failed_notification',
          subscription_id: pastDueSub.id,
          customer_id: pastDueSub.customer_id,
          organization_id: pastDueSub.organization_id,
          metadata: {
            invoice_id: invoice.id,
            attempt_count: invoiceData.attempt_count || 1,
          },
          status: 'pending',
        } as any);
      }
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
  private async handleCustomerCreated(
    customer: Stripe.Customer,
  ): Promise<void> {
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
  private async handleCustomerUpdated(
    customer: Stripe.Customer,
  ): Promise<void> {
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
  private async handleCustomerDeleted(
    customer: Stripe.Customer,
  ): Promise<void> {
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
   *
   * New flow (direct-subscription checkout):
   *   Subscription was created during createCheckout() — just update its status,
   *   handle upgrade/downgrade, and grant features.
   *
   * Legacy flow (pre-migration PIs without a subscription):
   *   Falls back to creating a subscription in the webhook.
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

      const metadata = paymentIntent.metadata || {};
      const checkoutMetadata = (checkoutSession?.metadata ?? {}) as Record<
        string,
        unknown
      >;
      const organizationId = metadata.organizationId;
      const productId = metadata.productId;
      const priceId = metadata.priceId;

      if (!organizationId || !productId || !priceId) {
        this.logger.error(
          'Missing required metadata in payment intent:',
          metadata,
        );
        return;
      }

      // Determine if this is the new direct-subscription flow
      const piMetadata = (paymentIntentRecord.metadata ?? {}) as Record<
        string,
        unknown
      >;
      const stripeSubscriptionId =
        paymentIntentRecord.stripe_subscription_id ||
        (checkoutMetadata.stripeSubscriptionId as string | undefined) ||
        (piMetadata.stripeSubscriptionId as string | undefined);

      const isDirectSubscriptionFlow =
        !!stripeSubscriptionId ||
        !!piMetadata.subscriptionCreatedDuringCheckout;

      if (isDirectSubscriptionFlow && stripeSubscriptionId) {
        await this.handleDirectSubscriptionPaymentSuccess(
          paymentIntent,
          paymentIntentRecord,
          checkoutSession,
          stripeSubscriptionId,
        );
      } else {
        // FIX 2: Check if this PaymentIntent actually belongs to an existing
        // Stripe subscription (webhook arrived before our DB commit).
        // Expand the invoice to find the subscription.
        let resolvedStripeSubId: string | null = null;
        try {
          const piInvoice = (paymentIntent as any).invoice;
          if (piInvoice) {
            const invoiceId =
              typeof piInvoice === 'string' ? piInvoice : piInvoice?.id;
            if (invoiceId) {
              const inv = await this.stripeService
                .getClient()
                .invoices.retrieve(invoiceId, {
                  stripeAccount:
                    paymentIntentRecord.stripe_account_id || undefined,
                });
              const invSubscription = (inv as any).subscription;
              if (invSubscription) {
                resolvedStripeSubId =
                  typeof invSubscription === 'string'
                    ? invSubscription
                    : invSubscription.id;
              }
            }
          }
        } catch (resolveError) {
          this.logger.warn(
            'Could not resolve invoice subscription for race check:',
            resolveError,
          );
        }

        if (resolvedStripeSubId) {
          this.logger.log(
            `Resolved subscription ${resolvedStripeSubId} from invoice — routing to direct flow instead of legacy`,
          );
          await this.handleDirectSubscriptionPaymentSuccess(
            paymentIntent,
            paymentIntentRecord,
            checkoutSession,
            resolvedStripeSubId,
          );
        } else {
          // Legacy flow: subscription was NOT created during checkout.
          // Fall back to creating one now.
          this.logger.log(
            `Legacy flow: creating subscription in webhook for PI ${paymentIntent.id}`,
          );
          await this.handleLegacyPaymentIntentSuccess(
            paymentIntent,
            paymentIntentRecord,
            checkoutSession,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Critical error in payment_intent.succeeded handler:',
        error,
      );
      this.logger.error('Stack trace:', error?.stack);
    }
  }

  /**
   * New flow: subscription already exists (created during checkout).
   * Update status to active, handle upgrade/downgrade, grant features.
   */
  private async handleDirectSubscriptionPaymentSuccess(
    paymentIntent: Stripe.PaymentIntent,
    paymentIntentRecord: any,
    checkoutSession: any,
    stripeSubscriptionId: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const metadata = paymentIntent.metadata || {};
    const checkoutMetadata = checkoutSession?.metadata;
    const organizationId = metadata.organizationId;
    const productId = metadata.productId;
    const priceId = metadata.priceId;
    const customerId = metadata.customerId || paymentIntentRecord.customer_id;

    this.logger.log(
      `Direct subscription flow: updating subscription ${stripeSubscriptionId} to active`,
    );

    // Get the Stripe account ID
    const stripeAccountId =
      paymentIntentRecord.stripe_account_id ||
      checkoutMetadata?.stripeAccountId;

    // Fetch the updated subscription from Stripe to get current status and period data
    let stripeSubscription: Stripe.Subscription | null = null;
    if (stripeAccountId) {
      try {
        stripeSubscription = await this.stripeService
          .getClient()
          .subscriptions.retrieve(stripeSubscriptionId, {
            stripeAccount: stripeAccountId,
          });
      } catch (e) {
        this.logger.warn(
          `Could not fetch subscription ${stripeSubscriptionId} from Stripe:`,
          e,
        );
      }
    }

    // Find existing subscription record in our DB
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .single();

    // Build update data from Stripe subscription (or use defaults)
    const subData = stripeSubscription as any;
    const newStatus = stripeSubscription?.status || 'active';
    const updateData: any = {
      status: newStatus,
      payment_intent_id: paymentIntentRecord.id,
      updated_at: new Date().toISOString(),
    };

    if (subData?.current_period_start) {
      updateData.current_period_start = new Date(
        subData.current_period_start * 1000,
      ).toISOString();
    }
    if (subData?.current_period_end) {
      updateData.current_period_end = new Date(
        subData.current_period_end * 1000,
      ).toISOString();
    }

    // Apply discount info from checkout metadata
    if (checkoutMetadata?.appliedDiscountId) {
      updateData.discount_id = checkoutMetadata.appliedDiscountId;
      updateData.discount_amount = checkoutMetadata.discountAmount
        ? parseInt(String(checkoutMetadata.discountAmount), 10)
        : null;
      updateData.discount_code = checkoutMetadata.appliedDiscountCode || null;
    }

    // Update metadata
    const existingMeta = (existingSubscription?.metadata as any) || {};
    updateData.metadata = {
      ...existingMeta,
      payment_intent_id: paymentIntentRecord.id,
      activated_from: 'direct_subscription_payment_succeeded',
    };

    let subscription: any;

    if (existingSubscription) {
      // Update existing subscription record
      const { data, error } = await supabase
        .from('subscriptions')
        .update(updateData)
        .eq('id', existingSubscription.id)
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to update subscription:', error);
        return;
      }
      subscription = data;
      this.logger.log(
        `Subscription ${existingSubscription.id} updated to ${newStatus}`,
      );
    } else {
      // Edge case: subscription not in DB (DB write failed during checkout).
      // Create it now from Stripe data.
      this.logger.warn(
        `Subscription ${stripeSubscriptionId} not found in DB — creating from Stripe data`,
      );

      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          customer_id: customerId,
          organization_id: organizationId,
          product_id: productId,
          price_id: priceId,
          stripe_subscription_id: stripeSubscriptionId,
          status: newStatus,
          current_period_start:
            updateData.current_period_start || new Date().toISOString(),
          current_period_end:
            updateData.current_period_end ||
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          cancel_at_period_end: false,
          amount: paymentIntentRecord.amount || 0,
          currency: paymentIntentRecord.currency || 'usd',
          payment_intent_id: paymentIntentRecord.id,
          discount_id: updateData.discount_id || null,
          discount_amount: updateData.discount_amount || null,
          discount_code: updateData.discount_code || null,
          metadata: {
            payment_intent_id: paymentIntentRecord.id,
            created_from: 'direct_subscription_payment_succeeded_fallback',
          },
        })
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to create subscription in DB:', error);
        return;
      }
      subscription = data;
    }

    // Handle upgrade/downgrade: cancel existing subscription
    if (checkoutMetadata?.existingSubscriptionId) {
      await this.handleUpgradeDowngrade(
        supabase,
        checkoutMetadata.existingSubscriptionId,
        stripeAccountId,
        checkoutSession?.id,
      );
    }

    // Invalidate product revenue metrics cache
    const cacheKey = `product-metrics:${productId}`;
    await this.cacheManager.del(cacheKey);

    // Grant features
    await this.grantProductFeatures(
      supabase,
      productId,
      customerId,
      subscription.id,
    );

    // Update checkout session with subscription info
    await supabase
      .from('checkout_sessions')
      .update({
        subscription_id: subscription.id,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_intent_id', paymentIntentRecord.id);

    this.logger.log(
      `Successfully completed direct-subscription flow for PI ${paymentIntent.id}`,
    );
  }

  /**
   * Legacy flow: subscription was NOT created during checkout.
   * Create subscription in the webhook (old behavior, for backward compat).
   */
  private async handleLegacyPaymentIntentSuccess(
    paymentIntent: Stripe.PaymentIntent,
    paymentIntentRecord: any,
    checkoutSession: any,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const metadata = paymentIntent.metadata || {};
    const checkoutMetadata = (checkoutSession?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const organizationId = metadata.organizationId;
    const externalUserId = metadata.externalUserId;
    const productId = metadata.productId;
    const priceId = metadata.priceId;
    const trialDays = parseInt(metadata.trialDays || '0', 10);

    // Ensure customer exists
    let customerId = paymentIntentRecord.customer_id as string | undefined;
    const stripeCustomerId =
      typeof paymentIntent.customer === 'string'
        ? paymentIntent.customer
        : paymentIntent.customer?.id;

    if (!stripeCustomerId) {
      this.logger.error('No Stripe customer ID in payment intent');
      return;
    }

    if (!customerId) {
      const customerData = {
        organization_id: organizationId,
        stripe_customer_id: stripeCustomerId,
        external_id: externalUserId,
        email: metadata.customerEmail?.toLowerCase(),
        name: metadata.customerName,
        updated_at: new Date().toISOString(),
      };

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
          break;
        }

        if (customerError.code === '23505' && retries > 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * (4 - retries)),
          );
          retries--;

          const { data: existingCustomer } = await supabase
            .from('customers')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('stripe_customer_id', stripeCustomerId)
            .single();

          if (existingCustomer) {
            customerId = existingCustomer.id;
            break;
          }
        } else {
          this.logger.error('Failed to create/find customer:', customerError);
          return;
        }
      }

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

    if (!organization?.accounts) {
      this.logger.error(
        `Organization ${organizationId} Stripe account not found`,
      );
      return;
    }

    const stripeAccountId = (organization.accounts as any).stripe_id;

    // Check for existing subscriptions
    const { data: allSubscriptions } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, created_at, price_id')
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    let reactivatedSubscriptionId: string | null = null;

    if (allSubscriptions && allSubscriptions.length > 0) {
      const activeSubscription = allSubscriptions.find(
        (sub) =>
          ['active', 'trialing', 'past_due'].includes(sub.status) &&
          sub.stripe_subscription_id?.startsWith('sub_'),
      );

      if (activeSubscription) {
        this.logger.log(
          `Subscription already exists for customer ${customerId}: ${activeSubscription.id}`,
        );
        return;
      }

      const canceledSubscription = allSubscriptions.find((sub) =>
        ['canceled', 'ended'].includes(sub.status),
      );
      if (canceledSubscription) {
        reactivatedSubscriptionId = canceledSubscription.id;
      }

      // Clean up invalid subscriptions
      const invalidSubs = allSubscriptions.filter(
        (sub) =>
          sub.status === 'incomplete' &&
          (!sub.stripe_subscription_id ||
            !sub.stripe_subscription_id.startsWith('sub_')),
      );
      for (const invalidSub of invalidSubs) {
        await supabase.from('subscriptions').delete().eq('id', invalidSub.id);
      }
    }

    // Get price details
    const { data: price } = await supabase
      .from('product_prices')
      .select(
        'stripe_price_id, price_amount, price_currency, recurring_interval, recurring_interval_count',
      )
      .eq('id', priceId)
      .single();

    if (!price?.stripe_price_id) {
      this.logger.error(`Stripe price not found for ${priceId}`);
      return;
    }

    // Attach payment method
    if (paymentIntent.payment_method) {
      try {
        const paymentMethodId =
          typeof paymentIntent.payment_method === 'string'
            ? paymentIntent.payment_method
            : paymentIntent.payment_method.id;

        await this.stripeService.attachPaymentMethodToCustomer(
          paymentMethodId,
          stripeCustomerId,
          stripeAccountId,
        );
        await this.stripeService.updateCustomer(
          stripeCustomerId,
          { invoice_settings: { default_payment_method: paymentMethodId } },
          stripeAccountId,
        );
      } catch (pmError) {
        this.logger.error('Failed to attach payment method:', pmError);
      }
    }

    // Create subscription with trial_end deferral (legacy double-charge prevention)
    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: stripeCustomerId,
      items: [{ price: price.stripe_price_id }],
      payment_behavior: 'allow_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: {
        organizationId,
        customerId,
        productId,
        priceId,
        externalUserId,
      },
      expand: ['latest_invoice.payment_intent'],
    };

    const now = Math.floor(Date.now() / 1000);
    const billingInterval =
      metadata.billingInterval || price.recurring_interval || 'month';
    const billingIntervalCount =
      parseInt(metadata.billingIntervalCount || '1', 10) || 1;
    const deferSeconds =
      billingInterval === 'year'
        ? billingIntervalCount * 365 * 24 * 60 * 60
        : billingIntervalCount * 30 * 24 * 60 * 60;

    let shouldGrantTrial = false;
    if (trialDays > 0) {
      // FIX 6: Acquire trial lock to prevent concurrent trial grants
      const trialLockKey = `trial-lock:${customerId}:${productId}`;
      const acquiredTrialLock = await this.redisService.setIdempotencyKey(
        trialLockKey,
        Date.now().toString(),
        30000, // 30s TTL
      );

      if (!acquiredTrialLock) {
        this.logger.warn(
          `Trial lock not acquired for ${customerId}:${productId} — proceeding without trial`,
        );
      }

      const { data: trialEligible } = await supabase.rpc(
        'check_trial_eligibility',
        {
          p_customer_id: customerId,
          p_product_id: productId,
        },
      );
      if (trialEligible && acquiredTrialLock) {
        subscriptionParams.trial_end =
          now + deferSeconds + trialDays * 24 * 60 * 60;
        shouldGrantTrial = true;
      } else {
        subscriptionParams.trial_end = now + deferSeconds;
      }
    } else {
      subscriptionParams.trial_end = now + deferSeconds;
    }

    if (paymentIntent.payment_method) {
      const pmId =
        typeof paymentIntent.payment_method === 'string'
          ? paymentIntent.payment_method
          : paymentIntent.payment_method.id;
      subscriptionParams.default_payment_method = pmId;
    }

    if (checkoutMetadata.stripeCouponId) {
      const discountDuration =
        (checkoutMetadata.discountDuration as string) || 'once';
      if (discountDuration !== 'once') {
        subscriptionParams.discounts = [
          { coupon: checkoutMetadata.stripeCouponId as string },
        ];
      }
    }

    // Handle upgrade/downgrade
    if (checkoutMetadata.existingSubscriptionId) {
      await this.handleUpgradeDowngrade(
        supabase,
        checkoutMetadata.existingSubscriptionId as string,
        stripeAccountId,
        checkoutSession?.id,
      );
    }

    // Create Stripe subscription
    let stripeSubscription;
    try {
      const idempotencyKey = `legacy-sub:${customerId}:${productId}:${Date.now()}`;
      stripeSubscription = await this.stripeService.createSubscription(
        subscriptionParams,
        stripeAccountId,
        idempotencyKey,
      );
    } catch (subError) {
      this.logger.error('Failed to create Stripe subscription:', subError);
      return;
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('organization_id')
      .eq('id', customerId)
      .single();

    if (!customer) {
      this.logger.error(`Customer ${customerId} not found`);
      return;
    }

    const subscriptionData = {
      customer_id: customerId,
      organization_id: customer.organization_id,
      product_id: productId,
      price_id: priceId,
      stripe_subscription_id: stripeSubscription.id,
      status: stripeSubscription.status,
      current_period_start: stripeSubscription.current_period_start
        ? new Date(stripeSubscription.current_period_start * 1000).toISOString()
        : new Date().toISOString(),
      current_period_end: stripeSubscription.current_period_end
        ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      trial_end: stripeSubscription.trial_end
        ? new Date(stripeSubscription.trial_end * 1000).toISOString()
        : null,
      trial_start: stripeSubscription.trial_start
        ? new Date(stripeSubscription.trial_start * 1000).toISOString()
        : null,
      cancel_at_period_end: false,
      amount: price.price_amount || 0,
      currency: price.price_currency || 'usd',
      discount_id: (checkoutMetadata.appliedDiscountId as string) || null,
      discount_amount: checkoutMetadata.discountAmount
        ? parseInt(String(checkoutMetadata.discountAmount as number), 10)
        : null,
      discount_code: (checkoutMetadata.appliedDiscountCode as string) || null,
      payment_intent_id: paymentIntentRecord.id,
      metadata: {
        payment_intent_id: paymentIntentRecord.id,
        created_from: 'legacy_payment_intent_succeeded',
        hasRealTrial: shouldGrantTrial,
        trialDays: shouldGrantTrial ? trialDays : 0,
      },
    };

    let subscription: any;
    let subError: any;

    if (reactivatedSubscriptionId) {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          ...subscriptionData,
          canceled_at: null,
          ended_at: null,
          metadata: {
            ...subscriptionData.metadata,
            reactivatedAt: new Date().toISOString(),
          },
        })
        .eq('id', reactivatedSubscriptionId)
        .select()
        .single();
      subscription = data;
      subError = error;
    } else {
      const { data, error } = await supabase
        .from('subscriptions')
        .insert(subscriptionData)
        .select()
        .single();
      subscription = data;
      subError = error;
    }

    if (subError) {
      this.logger.error('Failed to save subscription:', subError);
      await this.refundService.refundPaymentOnFailure({
        paymentIntentId: paymentIntent.id,
        stripeAccountId,
        reason: `subscription_creation_failed: ${subError.message}`,
      });
      try {
        await this.stripeService.cancelSubscription(
          stripeSubscription.id,
          stripeAccountId,
        );
      } catch (cancelError) {
        this.logger.error(
          'Failed to cancel subscription after DB error:',
          cancelError,
        );
      }
      return;
    }

    // Invalidate cache
    await this.cacheManager.del(`product-metrics:${productId}`);

    // Grant features
    await this.grantProductFeatures(
      supabase,
      productId,
      customerId,
      subscription.id,
    );

    // Update checkout session
    await supabase
      .from('checkout_sessions')
      .update({
        subscription_id: subscription.id,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_intent_id', paymentIntentRecord.id);

    this.logger.log(`Legacy flow completed for PI ${paymentIntent.id}`);
  }

  /**
   * Handle charge.refunded webhook
   * Full refund → cancel subscription + revoke features; partial → log only
   */
  private async handleChargeRefunded(event: Stripe.Event): Promise<void> {
    try {
      const charge = event.data.object as any;
      this.logger.log(
        `Charge refunded: ${charge.id} (refunded: ${charge.amount_refunded}/${charge.amount})`,
      );

      const supabase = this.supabaseService.getClient();
      const isFullRefund = charge.amount_refunded === charge.amount;

      // Find subscription via charge → invoice → subscription
      let stripeSubscriptionId: string | null = null;
      if (charge.invoice) {
        const invoiceId =
          typeof charge.invoice === 'string'
            ? charge.invoice
            : charge.invoice.id;

        // Look up the invoice to get the subscription
        const stripeAccountId = event.account || undefined;
        try {
          const invoice = (await this.stripeService
            .getClient()
            .invoices.retrieve(
              invoiceId,
              stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
            )) as any;
          stripeSubscriptionId =
            typeof invoice.subscription === 'string'
              ? invoice.subscription
              : invoice.subscription?.id || null;
        } catch (invoiceError) {
          this.logger.warn(
            `Could not retrieve invoice ${invoiceId} for refund:`,
            invoiceError,
          );
        }
      }

      // Look up our DB subscription
      let subscriptionRecord: { id: string; product_id: string } | null = null;
      if (stripeSubscriptionId) {
        const { data } = await supabase
          .from('subscriptions')
          .select('id, product_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .single();
        subscriptionRecord = data;
      }

      if (isFullRefund && subscriptionRecord) {
        // Full refund: cancel subscription and revoke features
        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
          })
          .eq('id', subscriptionRecord.id);

        await this.subscriptionsService.revokeSubscriptionFeatures(
          subscriptionRecord.id,
        );

        // Invalidate cache
        if (subscriptionRecord.product_id) {
          await this.cacheManager.del(
            `product-metrics:${subscriptionRecord.product_id}`,
          );
        }

        this.logger.log(
          `Full refund on charge ${charge.id} — subscription ${subscriptionRecord.id} canceled and features revoked`,
        );
      } else if (!isFullRefund) {
        this.logger.log(
          `Partial refund on charge ${charge.id} — logged only, no feature changes`,
        );
      }

      // Log refund via RefundService
      const latestRefund = charge.refunds?.data?.[0];
      if (latestRefund) {
        await this.refundService.logRefund({
          paymentIntentId:
            typeof charge.payment_intent === 'string'
              ? charge.payment_intent
              : charge.payment_intent?.id || charge.id,
          stripeRefundId: latestRefund.id,
          amount: latestRefund.amount,
          currency: latestRefund.currency,
          reason: isFullRefund ? 'full_refund' : 'partial_refund',
          status: latestRefund.status || 'succeeded',
          stripeAccountId: event.account || undefined,
          metadata: {
            chargeId: charge.id,
            subscriptionId: subscriptionRecord?.id,
            isFullRefund,
          },
        });
      }
    } catch (error) {
      this.logger.error('Error handling charge.refunded:', error);
    }
  }

  /**
   * Handle charge.refund.updated webhook
   * Update refund status in our database
   */
  private async handleRefundUpdated(event: Stripe.Event): Promise<void> {
    try {
      const refund = event.data.object as Stripe.Refund;
      this.logger.log(
        `Refund updated: ${refund.id} — status: ${refund.status}`,
      );

      const supabase = this.supabaseService.getClient();

      // Update the refund record matching stripe_refund_id
      const { error } = await supabase
        .from('refunds')
        .update({
          status: refund.status || 'unknown',
          metadata: {
            updatedAt: new Date().toISOString(),
            failureReason: refund.failure_reason,
          },
        })
        .eq('stripe_refund_id', refund.id);

      if (error) {
        this.logger.warn(
          `Could not update refund ${refund.id} in database:`,
          error,
        );
      } else {
        this.logger.log(
          `Refund ${refund.id} status updated to ${refund.status}`,
        );
      }
    } catch (error) {
      this.logger.error('Error handling charge.refund.updated:', error);
    }
  }

  /**
   * Handle charge.dispute.created webhook
   * Immediately revoke features and queue for review
   */
  private async handleDisputeCreated(event: Stripe.Event): Promise<void> {
    try {
      const dispute = event.data.object as Stripe.Dispute;
      this.logger.warn(
        `Dispute created: ${dispute.id} — reason: ${dispute.reason}, amount: ${dispute.amount}`,
      );

      const supabase = this.supabaseService.getClient();

      // Get the charge ID from the dispute
      const chargeId =
        typeof dispute.charge === 'string'
          ? dispute.charge
          : dispute.charge?.id;

      if (!chargeId) {
        this.logger.error(`Dispute ${dispute.id} has no charge ID`);
        return;
      }

      // Look up invoice from charge to find subscription
      let stripeSubscriptionId: string | null = null;
      const stripeAccountId = event.account || undefined;

      try {
        const charge = (await this.stripeService
          .getClient()
          .charges.retrieve(
            chargeId,
            stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
          )) as any;

        if (charge.invoice) {
          const invoiceId =
            typeof charge.invoice === 'string'
              ? charge.invoice
              : charge.invoice.id;

          const invoice = (await this.stripeService
            .getClient()
            .invoices.retrieve(
              invoiceId,
              stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
            )) as any;

          stripeSubscriptionId =
            typeof invoice.subscription === 'string'
              ? invoice.subscription
              : invoice.subscription?.id || null;
        }
      } catch (lookupError) {
        this.logger.warn(
          `Could not look up charge/invoice for dispute ${dispute.id}:`,
          lookupError,
        );
      }

      // Find our DB subscription
      let subscriptionRecord: {
        id: string;
        product_id: string;
        customer_id: string;
        organization_id: string;
      } | null = null;

      if (stripeSubscriptionId) {
        const { data } = await supabase
          .from('subscriptions')
          .select('id, product_id, customer_id, organization_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .single();
        subscriptionRecord = data;
      }

      if (subscriptionRecord) {
        // Immediately revoke features — safe default during dispute
        await this.subscriptionsService.revokeSubscriptionFeatures(
          subscriptionRecord.id,
        );

        // Update subscription status to past_due (not canceled — dispute may be won)
        await supabase
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('id', subscriptionRecord.id);

        // Invalidate cache
        if (subscriptionRecord.product_id) {
          await this.cacheManager.del(
            `product-metrics:${subscriptionRecord.product_id}`,
          );
        }

        // Insert into reconciliation queue
        await this.refundService.addToReconciliationQueue({
          type: 'dispute_opened',
          referenceId: subscriptionRecord.id,
          status: 'pending_manual_review',
          priority: 1,
          details: {
            disputeId: dispute.id,
            reason: dispute.reason,
            amount: dispute.amount,
            chargeId,
            customerId: subscriptionRecord.customer_id,
            organizationId: subscriptionRecord.organization_id,
          },
        });

        this.logger.warn(
          `Dispute ${dispute.id}: features revoked for subscription ${subscriptionRecord.id}, queued for review`,
        );
      } else {
        this.logger.warn(
          `Dispute ${dispute.id}: could not find matching subscription — logging only`,
        );

        // Still queue for manual review even without a matching subscription
        await this.refundService.addToReconciliationQueue({
          type: 'dispute_opened',
          referenceId: chargeId,
          status: 'pending_manual_review',
          priority: 1,
          details: {
            disputeId: dispute.id,
            reason: dispute.reason,
            amount: dispute.amount,
            chargeId,
          },
        });
      }
    } catch (error) {
      this.logger.error('Error handling charge.dispute.created:', error);
    }
  }

  /**
   * Handle charge.dispute.closed webhook
   * Won → restore features; Lost → ensure canceled
   */
  private async handleDisputeClosed(event: Stripe.Event): Promise<void> {
    try {
      const dispute = event.data.object as Stripe.Dispute;
      this.logger.log(
        `Dispute closed: ${dispute.id} — status: ${dispute.status}`,
      );

      const supabase = this.supabaseService.getClient();

      // Get the charge ID
      const chargeId =
        typeof dispute.charge === 'string'
          ? dispute.charge
          : dispute.charge?.id;

      if (!chargeId) {
        this.logger.error(`Dispute ${dispute.id} has no charge ID`);
        return;
      }

      // Find subscription via charge → invoice → subscription
      let stripeSubscriptionId: string | null = null;
      const stripeAccountId = event.account || undefined;

      try {
        const charge = (await this.stripeService
          .getClient()
          .charges.retrieve(
            chargeId,
            stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
          )) as any;

        if (charge.invoice) {
          const invoiceId =
            typeof charge.invoice === 'string'
              ? charge.invoice
              : charge.invoice.id;

          const invoice = (await this.stripeService
            .getClient()
            .invoices.retrieve(
              invoiceId,
              stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
            )) as any;

          stripeSubscriptionId =
            typeof invoice.subscription === 'string'
              ? invoice.subscription
              : invoice.subscription?.id || null;
        }
      } catch (lookupError) {
        this.logger.warn(
          `Could not look up charge/invoice for dispute ${dispute.id}:`,
          lookupError,
        );
      }

      let subscriptionRecord: {
        id: string;
        product_id: string;
        customer_id: string;
      } | null = null;

      if (stripeSubscriptionId) {
        const { data } = await supabase
          .from('subscriptions')
          .select('id, product_id, customer_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .single();
        subscriptionRecord = data;
      }

      if (!subscriptionRecord) {
        this.logger.warn(
          `Dispute ${dispute.id} closed but no matching subscription found`,
        );
        return;
      }

      if (dispute.status === 'won') {
        // Merchant won the dispute — restore features
        const { data: sub } = await supabase
          .from('subscriptions')
          .select(
            'id, customer_id, product_id, current_period_start, current_period_end',
          )
          .eq('id', subscriptionRecord.id)
          .single();

        if (sub) {
          await this.subscriptionsService.grantProductFeatures(
            sub.customer_id,
            sub.id,
            sub.product_id,
            new Date(sub.current_period_start),
            new Date(sub.current_period_end),
          );

          await supabase
            .from('subscriptions')
            .update({ status: 'active' })
            .eq('id', subscriptionRecord.id);

          this.logger.log(
            `Dispute ${dispute.id} won — features restored for subscription ${subscriptionRecord.id}`,
          );
        }
      } else if (dispute.status === 'lost') {
        // Merchant lost — ensure subscription is canceled and features revoked
        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
          })
          .eq('id', subscriptionRecord.id);

        await this.subscriptionsService.revokeSubscriptionFeatures(
          subscriptionRecord.id,
        );

        // Invalidate cache
        if (subscriptionRecord.product_id) {
          await this.cacheManager.del(
            `product-metrics:${subscriptionRecord.product_id}`,
          );
        }

        this.logger.warn(
          `Dispute ${dispute.id} lost — subscription ${subscriptionRecord.id} canceled`,
        );
      }

      // Update reconciliation queue item
      await supabase
        .from('reconciliation_queue')
        .update({
          status: 'completed',
          details: {
            disputeOutcome: dispute.status,
            closedAt: new Date().toISOString(),
          } as any,
        })
        .eq('type', 'dispute_opened')
        .eq('reference_id', subscriptionRecord.id)
        .eq('status', 'pending_manual_review');
    } catch (error) {
      this.logger.error('Error handling charge.dispute.closed:', error);
    }
  }

  /**
   * Handle upgrade/downgrade by canceling the existing subscription
   */
  private async handleUpgradeDowngrade(
    supabase: SupabaseClient<Database>,
    existingSubscriptionId: string,
    stripeAccountId: string,
    checkoutSessionId?: string,
  ): Promise<void> {
    this.logger.log(
      `Upgrade/downgrade: canceling subscription ${existingSubscriptionId}`,
    );

    try {
      const { data: existingSubscription } = await supabase
        .from('subscriptions')
        .select('id, stripe_subscription_id, status, metadata')
        .eq('id', existingSubscriptionId)
        .single();

      if (!existingSubscription) {
        this.logger.warn(
          `Existing subscription ${existingSubscriptionId} not found`,
        );
        return;
      }

      if (existingSubscription.stripe_subscription_id?.startsWith('sub_')) {
        try {
          await this.stripeService.cancelSubscription(
            existingSubscription.stripe_subscription_id,
            stripeAccountId,
            false,
          );
        } catch (stripeError) {
          this.logger.warn(
            'Failed to cancel Stripe subscription:',
            stripeError,
          );
        }
      }

      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
          metadata: {
            ...((existingSubscription.metadata ?? {}) as Record<
              string,
              unknown
            >),
            canceledReason: 'upgraded_or_downgraded',
            newSubscriptionCheckoutSessionId: checkoutSessionId,
          },
        })
        .eq('id', existingSubscription.id);

      // Revoke features from old subscription immediately
      // (don't wait for subscription.deleted webhook which may be delayed)
      await this.subscriptionsService.revokeSubscriptionFeatures(
        existingSubscription.id,
      );

      this.logger.log(
        `Subscription ${existingSubscription.id} canceled and features revoked for upgrade/downgrade`,
      );
    } catch (error) {
      this.logger.error('Error canceling existing subscription:', error);
    }
  }

  /**
   * Grant product features to a customer for a subscription (with dedup)
   */
  private async grantProductFeatures(
    supabase: SupabaseClient<Database>,
    productId: string,
    customerId: string,
    subscriptionId: string,
  ): Promise<void> {
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('feature_id, config')
      .eq('product_id', productId);

    if (!productFeatures || productFeatures.length === 0) return;

    const { data: existingGrants } = await supabase
      .from('feature_grants')
      .select('feature_id')
      .eq('customer_id', customerId)
      .eq('subscription_id', subscriptionId);

    const existingFeatureIds = new Set(
      existingGrants?.map((g) => g.feature_id) || [],
    );

    const newFeatureGrants = productFeatures
      .filter((pf) => !existingFeatureIds.has(pf.feature_id))
      .map((pf) => ({
        customer_id: customerId,
        subscription_id: subscriptionId,
        feature_id: pf.feature_id,
        properties: pf.config || {},
        granted_at: new Date().toISOString(),
      }));

    if (newFeatureGrants.length > 0) {
      const { error: grantError } = await supabase
        .from('feature_grants')
        .insert(newFeatureGrants as any);

      if (grantError) {
        this.logger.error('Failed to grant features:', grantError);
      } else {
        this.logger.log(
          `Granted ${newFeatureGrants.length} features to customer ${customerId}`,
        );
      }
    }
  }

  /**
   * Handle setup_intent.succeeded webhook
   * Creates subscription with trial_period_days for trial product checkouts.
   * The customer is NOT charged — card is saved for future billing after trial ends.
   */
  private async handleSetupIntentSucceeded(
    setupIntent: Stripe.SetupIntent,
  ): Promise<void> {
    try {
      this.logger.log(`Setup intent succeeded: ${setupIntent.id}`);

      const metadata = setupIntent.metadata || {};
      if (metadata.isTrialCheckout !== 'true') {
        this.logger.log(
          `Setup intent ${setupIntent.id} is not a trial checkout — skipping`,
        );
        return;
      }

      const supabase = this.supabaseService.getClient();

      const organizationId = metadata.organizationId;
      const externalUserId = metadata.externalUserId;
      const productId = metadata.productId;
      const priceId = metadata.priceId;
      const trialDays = parseInt(metadata.trialDays || '0', 10);

      if (!organizationId || !productId || !priceId) {
        this.logger.error(
          'Missing required metadata in setup intent:',
          metadata,
        );
        return;
      }

      // Find our checkout session
      const { data: checkoutSession } = await supabase
        .from('checkout_sessions')
        .select('id, metadata')
        .filter('metadata->>stripeSetupIntentId', 'eq', setupIntent.id)
        .maybeSingle();

      const checkoutMeta = (checkoutSession?.metadata as any) || {};

      // Resolve customer
      const stripeCustomerId =
        typeof setupIntent.customer === 'string'
          ? setupIntent.customer
          : (setupIntent.customer as any)?.id;

      if (!stripeCustomerId) {
        this.logger.error('No Stripe customer ID in setup intent');
        return;
      }

      const { data: customer } = await supabase
        .from('customers')
        .select('id, organization_id')
        .eq('stripe_customer_id', stripeCustomerId)
        .maybeSingle();

      let customerId: string;
      let customerOrgId: string;

      if (!customer) {
        // Try by external_id
        const { data: customerByExtId } = await supabase
          .from('customers')
          .select('id, organization_id')
          .eq('organization_id', organizationId)
          .eq('external_id', externalUserId)
          .maybeSingle();

        if (!customerByExtId) {
          this.logger.error(
            `Customer not found for setup intent ${setupIntent.id}`,
          );
          return;
        }
        customerId = customerByExtId.id;
        customerOrgId = customerByExtId.organization_id;
      } else {
        customerId = customer.id;
        customerOrgId = customer.organization_id;
      }

      // Get organization's Stripe account
      const { data: organization } = await supabase
        .from('organizations')
        .select('accounts!inner(stripe_id)')
        .eq('id', organizationId)
        .single();

      if (!organization?.accounts) {
        this.logger.error(
          `Organization ${organizationId} Stripe account not found`,
        );
        return;
      }

      const stripeAccountId = (organization.accounts as any).stripe_id;

      // Check for existing active subscription
      const { data: existingSubs } = await supabase
        .from('subscriptions')
        .select('id, status, stripe_subscription_id')
        .eq('customer_id', customerId)
        .eq('product_id', productId)
        .in('status', ['active', 'trialing', 'incomplete', 'past_due']);

      if (existingSubs && existingSubs.length > 0) {
        this.logger.log(
          `Active subscription already exists for customer ${customerId} / product ${productId}`,
        );
        return;
      }

      // Get price details
      const { data: price } = await supabase
        .from('product_prices')
        .select(
          'stripe_price_id, price_amount, price_currency, recurring_interval, recurring_interval_count',
        )
        .eq('id', priceId)
        .single();

      if (!price?.stripe_price_id) {
        this.logger.error(`Stripe price not found for ${priceId}`);
        return;
      }

      // Attach payment method and set as default
      const paymentMethodId =
        typeof setupIntent.payment_method === 'string'
          ? setupIntent.payment_method
          : (setupIntent.payment_method as any)?.id;

      if (paymentMethodId) {
        try {
          await this.stripeService.attachPaymentMethodToCustomer(
            paymentMethodId,
            stripeCustomerId,
            stripeAccountId,
          );
          await this.stripeService.updateCustomer(
            stripeCustomerId,
            { invoice_settings: { default_payment_method: paymentMethodId } },
            stripeAccountId,
          );
          this.logger.log(
            `Payment method ${paymentMethodId} attached to customer ${stripeCustomerId}`,
          );
        } catch (pmError) {
          this.logger.error('Failed to attach payment method:', pmError);
        }
      }

      // Build subscription params
      const applicationFeePercent = 5;
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: stripeCustomerId,
        items: [{ price: price.stripe_price_id }],
        payment_behavior: 'allow_incomplete', // Trial has no upfront payment — don't require client confirmation
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        application_fee_percent: applicationFeePercent,
        metadata: {
          organizationId,
          customerId,
          productId,
          priceId,
          externalUserId,
        },
        expand: ['latest_invoice.payment_intent'],
      };

      // Set default payment method
      if (paymentMethodId) {
        subscriptionParams.default_payment_method = paymentMethodId;
      }

      // Grant trial (with Redis lock to prevent race conditions)
      if (trialDays > 0) {
        const trialLockKey = `trial-lock:${customerId}:${productId}`;
        const acquiredLock = await this.redisService.setIdempotencyKey(
          trialLockKey,
          Date.now().toString(),
          30000, // 30s TTL
        );

        if (!acquiredLock) {
          this.logger.warn(
            `Trial lock not acquired for ${customerId}:${productId} — another request is processing`,
          );
          return;
        }

        const { data: trialEligible } = await supabase.rpc(
          'check_trial_eligibility',
          { p_customer_id: customerId, p_product_id: productId },
        );

        if (trialEligible) {
          subscriptionParams.trial_period_days = trialDays;
          this.logger.log(
            `Granting ${trialDays}-day trial for customer ${customerId} on product ${productId}`,
          );
        } else {
          this.logger.warn(
            `Trial not eligible for customer ${customerId} — creating subscription without trial`,
          );
        }
      }

      // Apply discount coupon if one was used
      if (checkoutMeta?.stripeCouponId) {
        subscriptionParams.discounts = [
          { coupon: checkoutMeta.stripeCouponId },
        ];
        this.logger.log(
          `Attaching coupon ${checkoutMeta.stripeCouponId} to trial subscription`,
        );
      }

      // Create Stripe subscription
      let stripeSubscription;
      try {
        const idempotencyKey = `trial-sub:${customerId}:${productId}:${Date.now()}`;
        stripeSubscription = await this.stripeService.createSubscription(
          subscriptionParams,
          stripeAccountId,
          idempotencyKey,
        );
        this.logger.log(
          `Stripe subscription ${stripeSubscription.id} created (trial)`,
        );
      } catch (subError) {
        this.logger.error(
          'Failed to create Stripe subscription (trial):',
          subError,
        );
        return;
      }

      // Save subscription to database
      const subData = stripeSubscription;
      const subscriptionData = {
        customer_id: customerId,
        organization_id: customerOrgId,
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
        discount_id: checkoutMeta?.appliedDiscountId || null,
        discount_amount: checkoutMeta?.discountAmount
          ? parseInt(String(checkoutMeta.discountAmount), 10)
          : null,
        discount_code: checkoutMeta?.appliedDiscountCode || null,
        metadata: {
          setup_intent_id: setupIntent.id,
          created_from: 'setup_intent_succeeded',
          hasRealTrial: true,
          trialDays,
        },
      };

      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .insert(subscriptionData)
        .select()
        .single();

      if (subError) {
        this.logger.error('Failed to save trial subscription:', subError);
        // Cancel the Stripe subscription since we can't track it
        try {
          await this.stripeService.cancelSubscription(
            stripeSubscription.id,
            stripeAccountId,
          );
        } catch (cancelError) {
          this.logger.error(
            'Failed to cancel subscription after DB error:',
            cancelError,
          );
        }
        return;
      }

      // Update checkout session
      if (checkoutSession) {
        await supabase
          .from('checkout_sessions')
          .update({
            completed_at: new Date().toISOString(),
            subscription_id: subscription.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', checkoutSession.id);
      }

      // Invalidate cache
      const cacheKey = `product-metrics:${productId}`;
      await this.cacheManager.del(cacheKey);

      // Grant features
      const { data: productFeatures } = await supabase
        .from('product_features')
        .select('feature_id, config')
        .eq('product_id', productId);

      if (productFeatures && productFeatures.length > 0) {
        const featureGrants = productFeatures.map((pf) => ({
          customer_id: customerId,
          subscription_id: subscription.id,
          feature_id: pf.feature_id,
          properties: pf.config || {},
          granted_at: new Date().toISOString(),
        }));

        const { error: grantError } = await supabase
          .from('feature_grants')
          .insert(featureGrants);

        if (grantError) {
          this.logger.error(
            'Failed to grant features for trial subscription:',
            grantError,
          );
        } else {
          this.logger.log(
            `Granted ${featureGrants.length} features for trial subscription`,
          );
        }
      }

      this.logger.log(
        `Trial subscription flow completed for setup intent ${setupIntent.id}`,
      );
    } catch (error) {
      this.logger.error('Error handling setup_intent.succeeded:', error);
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

      this.logger.log(`Payment intent ${paymentIntent.id} marked as failed`);
    } catch (error) {
      this.logger.error('Error handling payment_intent.payment_failed:', error);
    }
  }

  /**
   * Handle checkout.session.completed webhook
   * Fired when an adaptive pricing Checkout Session completes.
   * Stripe has already created the subscription — we sync it to our DB.
   */
  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    try {
      this.logger.log(`Checkout session completed: ${session.id}`);

      // Only handle our adaptive mode sessions; ignore others (e.g. Stripe-hosted)
      const metadata = (session.metadata || {}) as Record<string, string>;
      const metadataId = metadata.metadataId;
      const organizationId = metadata.organizationId;
      const productId = metadata.productId;
      const priceId = metadata.priceId;

      if (!organizationId || !productId || !priceId) {
        this.logger.log(
          `Checkout session ${session.id} missing BillingOS metadata — skipping`,
        );
        return;
      }

      const supabase = this.supabaseService.getClient();

      // Find our checkout_sessions record by Stripe session ID (stored in metadata)
      const { data: checkoutSession } = await supabase
        .from('checkout_sessions')
        .select('id, subscription_id, completed_at, organization_id, metadata')
        .filter('metadata->>stripeCheckoutSessionId', 'eq', session.id)
        .maybeSingle();

      if (checkoutSession?.completed_at) {
        this.logger.log(
          `Checkout session ${session.id} already completed — skipping`,
        );
        return;
      }

      // Get the Stripe subscription ID created by Stripe for this checkout
      const stripeSubscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription as any)?.id;

      if (!stripeSubscriptionId) {
        this.logger.warn(
          `No subscription in completed checkout session ${session.id}`,
        );
        return;
      }

      // Resolve customer
      const stripeCustomerId =
        typeof session.customer === 'string'
          ? session.customer
          : (session.customer as any)?.id;

      const { data: customer, error: customerFetchError } = await supabase
        .from('customers')
        .select('id, organization_id')
        .eq('stripe_customer_id', stripeCustomerId)
        .single();

      if (customerFetchError || !customer) {
        this.logger.error(
          `Customer not found for stripe_customer_id ${stripeCustomerId}`,
        );
        return;
      }

      const customerId = customer.id;

      // Get price details
      const { data: price } = await supabase
        .from('product_prices')
        .select(
          'stripe_price_id, price_amount, price_currency, recurring_interval, recurring_interval_count',
        )
        .eq('id', priceId)
        .single();

      if (!price) {
        this.logger.error(`Price not found for priceId ${priceId}`);
        return;
      }

      // Get the connected Stripe account ID from our checkout session metadata
      const checkoutSessionMeta = (checkoutSession?.metadata as any) || {};
      const stripeAccountId = checkoutSessionMeta.stripeAccountId as
        | string
        | undefined;

      let stripeSub: any;
      try {
        stripeSub = await this.stripeService
          .getClient()
          .subscriptions.retrieve(stripeSubscriptionId, {
            stripeAccount: stripeAccountId,
          });
      } catch (err) {
        this.logger.error(
          `Failed to retrieve Stripe subscription ${stripeSubscriptionId}:`,
          err,
        );
        return;
      }

      // Check for existing subscription by stripe_subscription_id first
      const { data: existingByStripeId } = await supabase
        .from('subscriptions')
        .select('id, status')
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .maybeSingle();

      if (existingByStripeId) {
        this.logger.log(
          `Subscription ${stripeSubscriptionId} already in database — updating status`,
        );
        await supabase
          .from('subscriptions')
          .update({
            status: stripeSub.status,
            current_period_start: stripeSub.current_period_start
              ? new Date(stripeSub.current_period_start * 1000).toISOString()
              : new Date().toISOString(),
            current_period_end: stripeSub.current_period_end
              ? new Date(stripeSub.current_period_end * 1000).toISOString()
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('id', existingByStripeId.id);

        // Update checkout session record
        if (checkoutSession) {
          await supabase
            .from('checkout_sessions')
            .update({
              completed_at: new Date().toISOString(),
              subscription_id: existingByStripeId.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', checkoutSession.id);
        }
      } else {
        // Check for existing active subscription by (customer_id, product_id)
        // to avoid violating idx_unique_active_subscription constraint
        const { data: existingByCustomerProduct } = await supabase
          .from('subscriptions')
          .select('id, status, stripe_subscription_id')
          .eq('customer_id', customerId)
          .eq('product_id', productId)
          .in('status', ['active', 'trialing', 'incomplete', 'past_due'])
          .is('ended_at', null)
          .maybeSingle();

        let subscriptionId: string;

        // Use actual amount/currency from Stripe subscription (handles adaptive pricing)
        const stripeSubItem = stripeSub.items?.data?.[0];
        const actualAmount =
          stripeSubItem?.price?.unit_amount ?? price.price_amount ?? 0;
        const actualCurrency =
          stripeSub.currency ?? price.price_currency ?? 'usd';

        if (existingByCustomerProduct) {
          // Update existing subscription with new Stripe subscription ID
          this.logger.log(
            `Updating existing subscription ${existingByCustomerProduct.id} ` +
              `(${existingByCustomerProduct.stripe_subscription_id} → ${stripeSubscriptionId})`,
          );
          await supabase
            .from('subscriptions')
            .update({
              stripe_subscription_id: stripeSubscriptionId,
              price_id: priceId,
              status: stripeSub.status,
              current_period_start: stripeSub.current_period_start
                ? new Date(stripeSub.current_period_start * 1000).toISOString()
                : new Date().toISOString(),
              current_period_end: stripeSub.current_period_end
                ? new Date(stripeSub.current_period_end * 1000).toISOString()
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              amount: actualAmount,
              currency: actualCurrency,
              metadata: {
                created_from: 'checkout_session_completed',
                stripeCheckoutSessionId: session.id,
                metadataId,
              },
            })
            .eq('id', existingByCustomerProduct.id);

          subscriptionId = existingByCustomerProduct.id;
        } else {
          // Create new subscription record
          const subscriptionData = {
            customer_id: customerId,
            organization_id: customer.organization_id,
            product_id: productId,
            price_id: priceId,
            stripe_subscription_id: stripeSubscriptionId,
            status: stripeSub.status,
            current_period_start: stripeSub.current_period_start
              ? new Date(stripeSub.current_period_start * 1000).toISOString()
              : new Date().toISOString(),
            current_period_end: stripeSub.current_period_end
              ? new Date(stripeSub.current_period_end * 1000).toISOString()
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            trial_end: stripeSub.trial_end
              ? new Date(stripeSub.trial_end * 1000).toISOString()
              : null,
            trial_start: stripeSub.trial_start
              ? new Date(stripeSub.trial_start * 1000).toISOString()
              : null,
            cancel_at_period_end: false,
            amount: actualAmount,
            currency: actualCurrency,
            metadata: {
              created_from: 'checkout_session_completed',
              stripeCheckoutSessionId: session.id,
              metadataId,
            },
          };

          const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .insert(subscriptionData)
            .select()
            .single();

          if (subError) {
            this.logger.error(
              'Failed to save subscription from checkout session:',
              subError,
            );
            return;
          }

          subscriptionId = subscription.id;
        }

        this.logger.log(
          `Subscription ${subscriptionId} processed from checkout session ${session.id}`,
        );

        // Invalidate product revenue metrics cache
        const cacheKey = `product-metrics:${productId}`;
        await this.cacheManager.del(cacheKey);

        // Grant features — un-revoke existing grants or insert new ones
        const { data: productFeatures } = await supabase
          .from('product_features')
          .select('feature_id, config')
          .eq('product_id', productId);

        if (productFeatures && productFeatures.length > 0) {
          // Un-revoke any previously revoked grants for this subscription
          await supabase
            .from('feature_grants')
            .update({ revoked_at: null })
            .eq('subscription_id', subscriptionId)
            .not('revoked_at', 'is', null);

          // Check which features already have grants
          const { data: existingGrants } = await supabase
            .from('feature_grants')
            .select('feature_id')
            .eq('subscription_id', subscriptionId);

          const existingFeatureIds = new Set(
            (existingGrants || []).map(
              (g: { feature_id: string }) => g.feature_id,
            ),
          );

          // Only insert grants for features that don't already have one
          const newGrants = productFeatures
            .filter((pf) => !existingFeatureIds.has(pf.feature_id))
            .map((pf) => ({
              customer_id: customerId,
              subscription_id: subscriptionId,
              feature_id: pf.feature_id,
              properties: pf.config || {},
              granted_at: new Date().toISOString(),
            }));

          if (newGrants.length > 0) {
            const { error: grantError } = await supabase
              .from('feature_grants')
              .insert(newGrants);

            if (grantError) {
              this.logger.error('Failed to grant features:', grantError);
            } else {
              this.logger.log(
                `Granted ${newGrants.length} new features from checkout session`,
              );
            }
          }

          this.logger.log(
            `Feature grants ensured for subscription ${subscriptionId} (${existingFeatureIds.size} existing, ${newGrants.length} new)`,
          );
        }

        // Update checkout session record
        if (checkoutSession) {
          await supabase
            .from('checkout_sessions')
            .update({
              completed_at: new Date().toISOString(),
              subscription_id: subscriptionId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', checkoutSession.id);
        }
      }

      this.logger.log(`Checkout session ${session.id} processed successfully`);
    } catch (error) {
      this.logger.error('Error handling checkout.session.completed:', error);
    }
  }
}
