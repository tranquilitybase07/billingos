import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';

@Injectable()
export class SubscriptionSchedulerService {
  private readonly logger = new Logger(SubscriptionSchedulerService.name);
  private isProcessing = false;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Run every hour to process scheduled subscription changes
   */
  @Cron(CronExpression.EVERY_HOUR)
  async processScheduledChanges() {
    // Prevent concurrent execution
    if (this.isProcessing) {
      this.logger.log('Skipping scheduled changes processing - already running');
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
      .select(`
        *,
        subscription:subscriptions (
          *,
          customer:customers (
            id,
            stripe_customer_id,
            organization_id
          )
        ),
        to_price:product_prices (
          *,
          product:products (*)
        )
      `)
      .eq('status', 'scheduled')
      .lte('scheduled_for', now.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(50); // Process in batches

    if (error || !scheduledChanges) {
      this.logger.error('Error fetching scheduled changes:', error);
      return;
    }

    if (scheduledChanges.length === 0) {
      return; // Nothing to process
    }

    this.logger.log(`Processing ${scheduledChanges.length} scheduled changes`);

    for (const change of scheduledChanges) {
      try {
        await this.executeDowngrade(change);
      } catch (error) {
        this.logger.error(`Failed to execute scheduled change ${change.id}:`, error);

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

    this.logger.log(`Executing scheduled downgrade for subscription ${subscription.id}`);

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

    // Get organization's Stripe account
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', subscription.customer.organization_id)
      .single();

    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org?.account_id || '')
      .single();

    // Update Stripe subscription if it exists
    if (subscription.stripe_subscription_id && newPrice.stripe_price_id && account?.stripe_id) {
      try {
        await this.stripeService.updateSubscriptionPrice(
          subscription.stripe_subscription_id,
          newPrice.stripe_price_id,
          account.stripe_id,
        );
      } catch (stripeError) {
        this.logger.error('Failed to update Stripe subscription:', stripeError);
        throw new Error(`Stripe update failed: ${stripeError.message}`);
      }
    }

    // Update subscription in database
    const { error: subUpdateError } = await supabase
      .from('subscriptions')
      .update({
        product_id: newPrice.product_id,
        amount: newPrice.price_amount || 0,
        currency: newPrice.price_currency || 'usd',
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);

    if (subUpdateError) {
      throw new Error('Failed to update subscription in database');
    }

    // Update features (revoke old, grant new)
    // First revoke old features
    await supabase
      .from('feature_grants')
      .update({ revoked_at: new Date().toISOString() })
      .eq('subscription_id', subscription.id)
      .is('revoked_at', null);

    // Grant new features
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('feature_id, properties')
      .eq('product_id', newPrice.product_id);

    if (productFeatures && productFeatures.length > 0) {
      const featureGrants = productFeatures.map((pf: any) => ({
        subscription_id: subscription.id,
        feature_id: pf.feature_id,
        customer_id: subscription.customer_id,
        properties: pf.properties || {},
        granted_at: new Date().toISOString(),
      }));

      await supabase.from('feature_grants').insert(featureGrants);
    }

    // Mark change as completed
    await supabase
      .from('subscription_changes')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', change.id);

    this.logger.log(`Successfully completed scheduled downgrade for subscription ${subscription.id}`);

    // TODO: Send notification email to customer
  }
}