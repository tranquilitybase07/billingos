import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { EntitlementService } from '../billing/entitlements/entitlement.service';

@Injectable()
export class SubscriptionSchedulerService {
  private readonly logger = new Logger(SubscriptionSchedulerService.name);
  private isProcessing = false;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly entitlementService: EntitlementService,
  ) {}

  /**
   * Run every hour to process scheduled subscription changes
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async processScheduledChanges() {
    this.logger.log('⏰ Cron fired: processScheduledChanges');

    // Prevent concurrent execution
    if (this.isProcessing) {
      this.logger.log(
        'Skipping scheduled changes processing - already running',
      );
      return;
    }

    this.isProcessing = true;

    try {
      await this.executeScheduledDowngrades();
    } catch (error) {
      this.logger.error('Error processing scheduled changes:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute scheduled downgrades that are due
   */
  private async executeScheduledDowngrades() {
    const supabase = this.supabaseService.getClient();
    const now = new Date();

    // Find all scheduled changes that are due
    const { data: scheduledChanges, error } = await supabase
      .from('subscription_changes')
      .select(
        `
        *,
        subscription:subscriptions (
          *,
          customer:customers (
            id,
            stripe_customer_id,
            organization_id
          )
        ),
        to_price:product_prices!subscription_changes_to_price_id_fkey (
          *,
          product:products (*)
        )
      `,
      )
      .eq('status', 'scheduled')
      .lte('scheduled_for', now.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(50); // Process in batches

    if (error || !scheduledChanges) {
      this.logger.error('Error fetching scheduled changes:', error);
      return;
    }

    if (scheduledChanges.length === 0) {
      this.logger.log('No scheduled changes due — nothing to process');
      return;
    }

    this.logger.log(`Processing ${scheduledChanges.length} scheduled changes`);

    for (const change of scheduledChanges) {
      try {
        await this.executeDowngrade(change);
      } catch (error) {
        this.logger.error(
          `Failed to execute scheduled change ${change.id}:`,
          error,
        );

        // Mark as failed
        await supabase
          .from('subscription_changes')
          .update({
            status: 'failed',
            failed_reason: error.message || 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', change.id);
      }
    }
  }

  /**
   * Execute a single scheduled downgrade
   */
  private async executeDowngrade(change: any) {
    const supabase = this.supabaseService.getClient();
    const { subscription, to_price: newPrice } = change;

    if (!subscription || !newPrice) {
      throw new Error('Missing subscription or price data');
    }

    // Guard: check subscription is still active before executing
    if (
      subscription.status !== 'active' &&
      subscription.status !== 'trialing'
    ) {
      this.logger.warn(
        `Subscription ${subscription.id} is ${subscription.status} — skipping scheduled downgrade`,
      );
      await supabase
        .from('subscription_changes')
        .update({
          status: 'failed',
          failed_reason: `Subscription status is ${subscription.status}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', change.id);
      return;
    }

    this.logger.log(
      `Executing scheduled downgrade for subscription ${subscription.id}`,
    );

    // Start transaction by marking as processing
    const { error: updateError } = await supabase
      .from('subscription_changes')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', change.id)
      .eq('status', 'scheduled'); // Ensure it hasn't been processed

    if (updateError) {
      throw new Error('Failed to lock change for processing');
    }

    // Get organization's Stripe account and currency
    const { data: orgRaw } = await supabase
      .from('organizations')
      .select('account_id, default_currency')
      .eq('id', subscription.customer.organization_id)
      .single();

    const org = orgRaw as any;

    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org?.account_id || '')
      .single();

    // Update Stripe subscription price if it exists (paid→paid downgrade)
    if (
      subscription.stripe_subscription_id &&
      newPrice.stripe_price_id &&
      account?.stripe_id
    ) {
      try {
        await this.stripeService.updateSubscriptionPrice(
          subscription.stripe_subscription_id,
          newPrice.stripe_price_id,
          account.stripe_id,
          { prorationBehavior: 'none' },
        );
      } catch (stripeError: any) {
        this.logger.error('Failed to update Stripe subscription:', stripeError);
        throw new Error(`Stripe update failed: ${stripeError.message}`);
      }
    }

    // Downgrading to free product — cancel Stripe subscription immediately
    // (the billing period has already ended at this point)
    if (
      subscription.stripe_subscription_id &&
      !newPrice.stripe_price_id &&
      account?.stripe_id
    ) {
      try {
        await this.stripeService.cancelSubscription(
          subscription.stripe_subscription_id,
          account.stripe_id,
          false, // immediate cancel — period already ended
        );
      } catch (stripeError: any) {
        this.logger.error(
          'Failed to cancel Stripe subscription for free downgrade:',
          stripeError,
        );
        throw new Error(`Stripe cancellation failed: ${stripeError.message}`);
      }
    }

    // Update subscription in database (include price_id)
    const { error: subUpdateError } = await supabase
      .from('subscriptions')
      .update({
        product_id: newPrice.product_id,
        price_id: newPrice.id,
        amount: newPrice.price_amount || 0,
        currency: newPrice.price_currency || org?.default_currency || 'usd',
        // Clear Stripe link when downgrading to free
        stripe_subscription_id: newPrice.stripe_price_id
          ? subscription.stripe_subscription_id
          : null,
        updated_at: new Date().toISOString(),
        metadata: {
          ...((subscription.metadata ?? {}) as Record<string, unknown>),
          downgradeExecutedAt: new Date().toISOString(),
          downgradeChangeId: change.id,
          downgradeMethod: 'scheduled',
        },
      })
      .eq('id', subscription.id);

    if (subUpdateError) {
      throw new Error('Failed to update subscription in database');
    }

    // Swap features using EntitlementService
    const now = new Date();
    // Estimate next period end based on price interval
    const periodEnd = new Date(now);
    const interval = newPrice.recurring_interval || 'month';
    const intervalCount = newPrice.recurring_interval_count || 1;
    switch (interval) {
      case 'day':
        periodEnd.setDate(periodEnd.getDate() + intervalCount);
        break;
      case 'week':
        periodEnd.setDate(periodEnd.getDate() + 7 * intervalCount);
        break;
      case 'month':
        periodEnd.setMonth(periodEnd.getMonth() + intervalCount);
        break;
      case 'year':
        periodEnd.setFullYear(periodEnd.getFullYear() + intervalCount);
        break;
      default:
        periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    await this.entitlementService.swapForSubscription({
      subscriptionId: subscription.id,
      customerId: subscription.customer_id,
      newProductId: newPrice.product_id,
      periodStart: now,
      periodEnd,
    });

    // Mark change as completed
    await supabase
      .from('subscription_changes')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', change.id);

    this.logger.log(
      `Successfully completed scheduled downgrade for subscription ${subscription.id}`,
    );
  }
}
