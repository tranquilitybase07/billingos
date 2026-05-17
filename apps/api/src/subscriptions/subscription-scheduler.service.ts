import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { EntitlementService } from '../billing/entitlements/entitlement.service';
import type { Database } from '../../../../packages/shared/types/database';

type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];
type ProductPriceRow = Database['public']['Tables']['product_prices']['Row'];
type SubscriptionChangeRow =
  Database['public']['Tables']['subscription_changes']['Row'];

type ScheduledChange = SubscriptionChangeRow & {
  subscription:
    | (SubscriptionRow & {
        customer: {
          id: string;
          stripe_customer_id: string | null;
          organization_id: string;
        } | null;
      })
    | null;
  to_price: ProductPriceRow | null;
};

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
  @Cron(CronExpression.EVERY_HOUR)
  async processScheduledChanges() {
    // Prevent concurrent execution
    if (this.isProcessing) {
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
      return;
    }

    this.logger.log(`Processing ${scheduledChanges.length} scheduled changes`);

    for (const change of scheduledChanges as unknown as ScheduledChange[]) {
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
  private async executeDowngrade(change: ScheduledChange) {
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
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id, default_currency')
      .eq('id', subscription.organization_id)
      .single();

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
        // Detect interval change (yearly→monthly, etc.)
        let intervalChanged = false;
        if (subscription.price_id) {
          const { data: oldPrice } = await supabase
            .from('product_prices')
            .select('recurring_interval')
            .eq('id', subscription.price_id)
            .eq('organization_id', subscription.organization_id)
            .single();

          if (
            oldPrice &&
            oldPrice.recurring_interval !== newPrice.recurring_interval
          ) {
            intervalChanged = true;
            this.logger.log(
              `Interval change detected: ${oldPrice.recurring_interval} → ${newPrice.recurring_interval}`,
            );
          }
        }

        await this.stripeService.updateSubscriptionPrice(
          subscription.stripe_subscription_id,
          newPrice.stripe_price_id,
          account.stripe_id,
          {
            prorationBehavior: 'none',
            billingCycleAnchor: intervalChanged ? 'now' : 'unchanged',
          },
        );
      } catch (stripeError) {
        this.logger.error('Failed to update Stripe subscription:', stripeError);
        const msg =
          stripeError instanceof Error ? stripeError.message : 'unknown';
        throw new Error(`Stripe update failed: ${msg}`);
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
      } catch (stripeError) {
        this.logger.error(
          'Failed to cancel Stripe subscription for free downgrade:',
          stripeError,
        );
        const msg =
          stripeError instanceof Error ? stripeError.message : 'unknown';
        throw new Error(`Stripe cancellation failed: ${msg}`);
      }
    }

    const now = new Date();
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

    const isFreeDestination = !newPrice.stripe_price_id;

    // Update subscription in database (include price_id)
    const { error: subUpdateError } = await supabase
      .from('subscriptions')
      .update({
        product_id: newPrice.product_id,
        price_id: newPrice.id,
        amount: newPrice.price_amount || 0,
        currency: newPrice.price_currency || org?.default_currency || 'usd',
        // Clear Stripe link when downgrading to free
        stripe_subscription_id: isFreeDestination
          ? null
          : subscription.stripe_subscription_id,
        updated_at: now.toISOString(),
        ...(isFreeDestination
          ? {
              status: 'active',
              trial_start: null,
              trial_end: null,
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
              cancel_at_period_end: false,
              canceled_at: null,
              ended_at: null,
            }
          : {}),
        metadata: {
          ...((subscription.metadata ?? {}) as Record<string, unknown>),
          downgradeExecutedAt: now.toISOString(),
          downgradeChangeId: change.id,
          downgradeMethod: 'scheduled',
        },
      })
      .eq('id', subscription.id)
      .eq('organization_id', subscription.organization_id);

    if (subUpdateError) {
      throw new Error('Failed to update subscription in database');
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
