import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import {
  PreviewChangeDto,
  ChangeEffectiveTiming,
} from './dto/preview-change.dto';
import { ChangePlanDto } from './dto/change-plan.dto';

interface ProrationResult {
  unusedCredit: number; // Credit from unused portion of current plan (cents)
  newPlanCharge: number; // Charge for prorated new plan (cents)
  immediatePayment: number; // Net amount to charge now (cents)
  effectiveDate: Date;
  nextBillingDate: Date;
}

interface PlanDetails {
  id: string;
  product_id: string;
  product_name: string;
  amount: number;
  currency: string;
  recurring_interval: string;
  recurring_interval_count: number;
  stripe_price_id: string | null;
}

// Authentication context - supports both web app (JWT) and SDK (session token)
type AuthContext =
  | { userId: string; isSDK: false } // Web app request (JWT)
  | { organizationId: string; isSDK: true }; // SDK request (session token)

@Injectable()
export class SubscriptionUpgradeService {
  private readonly logger = new Logger(SubscriptionUpgradeService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Preview a plan change with proration calculation
   */
  async previewChange(
    subscriptionId: string,
    authContext: AuthContext,
    previewDto: PreviewChangeDto,
  ) {
    const supabase = this.supabaseService.getClient();

    // 1. Get subscription with current details
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select(
        `
        *,
        customer:customers (
          id,
          name,
          email,
          stripe_customer_id,
          organization_id
        ),
        product:products (
          id,
          name,
          recurring_interval,
          recurring_interval_count
        )
      `,
      )
      .eq('id', subscriptionId)
      .single();

    if (subError || !subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // 2. Verify access (different logic for web app vs SDK)
    if (authContext.isSDK) {
      // SDK request: verify subscription belongs to the organization
      if (subscription.customer.organization_id !== authContext.organizationId) {
        throw new ForbiddenException('You do not have access to this subscription');
      }
    } else {
      // Web app request: verify user is admin of the organization
      const { data: membership } = await supabase
        .from('user_organizations')
        .select('*')
        .eq('organization_id', subscription.customer.organization_id)
        .eq('user_id', authContext.userId)
        .is('deleted_at', null)
        .single();

      if (!membership) {
        throw new ForbiddenException('You do not have access to this subscription');
      }

      // Only admins can change subscription plans
      if ((membership as any).role !== 'admin') {
        throw new ForbiddenException('Only organization admins can change subscription plans');
      }
    }

    // 3. Get current price details
    const { data: currentPrice } = await supabase
      .from('product_prices')
      .select('*, product:products(id, name, recurring_interval, recurring_interval_count)')
      .eq('product_id', subscription.product_id)
      .single();

    if (!currentPrice) {
      throw new NotFoundException('Current price not found');
    }

    // 4. Get new price details
    const { data: newPrice, error: priceError } = await supabase
      .from('product_prices')
      .select('*, product:products(id, name, recurring_interval, recurring_interval_count, trial_days)')
      .eq('id', previewDto.new_price_id)
      .single();

    if (priceError || !newPrice) {
      throw new NotFoundException('New price not found');
    }

    // 4a. Validate not changing to same price
    if (currentPrice.id === previewDto.new_price_id) {
      throw new BadRequestException('You are already on this plan');
    }

    // 4b. Validate currency matches
    if (currentPrice.price_currency !== newPrice.price_currency) {
      throw new BadRequestException('Cannot change between different currencies');
    }

    // 5. Validate price belongs to organization
    const { data: newProduct } = await supabase
      .from('products')
      .select('organization_id')
      .eq('id', newPrice.product_id)
      .single();

    if (newProduct?.organization_id !== subscription.customer.organization_id) {
      throw new BadRequestException('Cannot change to a product from a different organization');
    }

    // 6. Validate same billing interval (Phase 1 constraint)
    if (
      newPrice.product.recurring_interval !== currentPrice.product.recurring_interval ||
      newPrice.product.recurring_interval_count !== currentPrice.product.recurring_interval_count
    ) {
      throw new BadRequestException(
        'Cannot change between different billing intervals (monthly/yearly). Please contact support.',
      );
    }

    // 7. Get Stripe account for organization
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

    // 8. Calculate proration or get from Stripe
    let proration: ProrationResult;

    if (subscription.stripe_subscription_id && newPrice.stripe_price_id && account?.stripe_id) {
      // Use Stripe API for accurate preview
      proration = await this.getStripeProrationPreview(
        subscription,
        currentPrice,
        newPrice,
        account.stripe_id,
        previewDto.effective_date || ChangeEffectiveTiming.IMMEDIATE,
      );
    } else {
      // Calculate locally for free plans
      proration = await this.calculateLocalProration(
        subscription,
        currentPrice,
        newPrice,
        previewDto.effective_date || ChangeEffectiveTiming.IMMEDIATE,
      );
    }

    // 9. Determine change type (upgrade vs downgrade)
    const changeType = this.determineChangeType(
      currentPrice.price_amount || 0,
      newPrice.price_amount || 0,
    );

    // 10. Build response
    return {
      current_plan: {
        name: currentPrice.product.name,
        amount: currentPrice.price_amount || 0,
        currency: currentPrice.price_currency || 'usd',
        interval: `${currentPrice.product.recurring_interval_count} ${currentPrice.product.recurring_interval}`,
      },
      new_plan: {
        name: newPrice.product.name,
        amount: newPrice.price_amount || 0,
        currency: newPrice.price_currency || 'usd',
        interval: `${newPrice.product.recurring_interval_count} ${newPrice.product.recurring_interval}`,
      },
      proration: {
        unused_credit: proration.unusedCredit,
        new_plan_charge: proration.newPlanCharge,
        immediate_payment: proration.immediatePayment,
      },
      change_type: changeType,
      effective_date: proration.effectiveDate.toISOString(),
      next_billing_date: proration.nextBillingDate.toISOString(),
      notes: this.getChangeNotes(changeType, previewDto.effective_date || ChangeEffectiveTiming.IMMEDIATE),
    };
  }

  /**
   * Execute a plan change (upgrade or downgrade)
   */
  async changePlan(
    subscriptionId: string,
    authContext: AuthContext,
    changePlanDto: ChangePlanDto,
  ) {
    const supabase = this.supabaseService.getClient();

    // 1. Get preview to validate and calculate amounts
    const preview = await this.previewChange(subscriptionId, authContext, {
      new_price_id: changePlanDto.new_price_id,
      effective_date: changePlanDto.effective_date,
    });

    // 2. Validate confirm_amount if provided (safety check)
    if (
      changePlanDto.confirm_amount !== undefined &&
      changePlanDto.confirm_amount !== preview.proration.immediate_payment
    ) {
      throw new BadRequestException(
        `Amount mismatch: Expected ${preview.proration.immediate_payment} but got ${changePlanDto.confirm_amount}. Please refresh and try again.`,
      );
    }

    // 3. Get subscription details
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select(
        `
        *,
        customer:customers (
          id,
          stripe_customer_id,
          organization_id
        )
      `,
      )
      .eq('id', subscriptionId)
      .single();

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // 4. Get organization Stripe account
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

    // 5. Get price details
    const { data: newPrice } = await supabase
      .from('product_prices')
      .select('*')
      .eq('id', changePlanDto.new_price_id)
      .single();

    const { data: currentPrice } = await supabase
      .from('product_prices')
      .select('*')
      .eq('product_id', subscription.product_id)
      .single();

    if (!newPrice || !currentPrice) {
      throw new NotFoundException('Price information not found');
    }

    const changeType = preview.change_type;
    const effectiveDate = changePlanDto.effective_date || ChangeEffectiveTiming.IMMEDIATE;

    try {
      // 6. Handle based on upgrade vs downgrade
      if (changeType === 'upgrade' || effectiveDate === ChangeEffectiveTiming.IMMEDIATE) {
        // Execute immediate change
        return await this.executeImmediateChange(
          subscription,
          currentPrice,
          newPrice,
          preview,
          account?.stripe_id || undefined,
        );
      } else {
        // Schedule downgrade for period end
        return await this.scheduleDowngrade(
          subscription,
          currentPrice,
          newPrice,
          preview,
        );
      }
    } catch (error) {
      this.logger.error('Error changing subscription plan:', error);
      throw new BadRequestException(
        error.message || 'Failed to change subscription plan',
      );
    }
  }

  /**
   * Get available plans for a subscription
   */
  async getAvailablePlans(subscriptionId: string, authContext: AuthContext) {
    const supabase = this.supabaseService.getClient();

    // 1. Get subscription with current plan
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select(
        `
        *,
        customer:customers (
          id,
          organization_id
        ),
        product:products (
          id,
          name,
          recurring_interval,
          recurring_interval_count
        )
      `,
      )
      .eq('id', subscriptionId)
      .single();

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // 2. Verify access (different logic for web app vs SDK)
    if (authContext.isSDK) {
      // SDK request: verify subscription belongs to the organization
      if (subscription.customer.organization_id !== authContext.organizationId) {
        throw new ForbiddenException('You do not have access to this subscription');
      }
    } else {
      // Web app request: verify user is admin of the organization
      const { data: membership } = await supabase
        .from('user_organizations')
        .select('*')
        .eq('organization_id', subscription.customer.organization_id)
        .eq('user_id', authContext.userId)
        .is('deleted_at', null)
        .single();

      if (!membership) {
        throw new ForbiddenException('You do not have access to this subscription');
      }

      // Only admins can change subscription plans
      if ((membership as any).role !== 'admin') {
        throw new ForbiddenException('Only organization admins can change subscription plans');
      }
    }

    // 3. Get current price
    const { data: currentPrice } = await supabase
      .from('product_prices')
      .select('*')
      .eq('product_id', subscription.product_id)
      .single();

    // 4. Get all active products from same organization with same billing interval
    const { data: products } = await supabase
      .from('products')
      .select(
        `
        id,
        name,
        description,
        recurring_interval,
        recurring_interval_count,
        product_prices (
          id,
          price_amount,
          price_currency,
          stripe_price_id,
          amount_type
        )
      `,
      )
      .eq('organization_id', subscription.customer.organization_id)
      .eq('is_archived', false)
      .eq('recurring_interval', subscription.product.recurring_interval)
      .eq('recurring_interval_count', subscription.product.recurring_interval_count);

    if (!products) {
      return {
        current_plan: null,
        available_upgrades: [],
        available_downgrades: [],
        restrictions: [],
      };
    }

    // 5. Categorize as upgrades or downgrades
    const currentAmount = currentPrice?.price_amount || 0;
    const upgrades: any[] = [];
    const downgrades: any[] = [];
    const restrictions: string[] = [];

    for (const product of products) {
      // Skip current product
      if (product.id === subscription.product_id) continue;

      // Get the first price (assuming one price per product for MVP)
      const price = product.product_prices?.[0];
      if (!price) continue;

      const planAmount = price.price_amount || 0;

      const planInfo = {
        product_id: product.id,
        product_name: product.name,
        description: product.description,
        price_id: price.id,
        amount: planAmount,
        currency: price.price_currency || 'usd',
        interval: `${product.recurring_interval_count} ${product.recurring_interval}`,
        is_free: price.amount_type === 'free',
      };

      if (planAmount > currentAmount) {
        upgrades.push(planInfo);
      } else if (planAmount < currentAmount) {
        downgrades.push(planInfo);
      }
    }

    // 6. Sort by price
    upgrades.sort((a, b) => a.amount - b.amount);
    downgrades.sort((a, b) => b.amount - a.amount);

    return {
      current_plan: {
        product_id: subscription.product_id,
        product_name: subscription.product.name,
        price_id: currentPrice?.id,
        amount: currentAmount,
        currency: currentPrice?.price_currency || 'usd',
        interval: `${subscription.product.recurring_interval_count} ${subscription.product.recurring_interval}`,
      },
      available_upgrades: upgrades,
      available_downgrades: downgrades,
      restrictions: restrictions,
    };
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Get proration preview from Stripe API (most accurate)
   */
  private async getStripeProrationPreview(
    subscription: any,
    currentPrice: any,
    newPrice: any,
    stripeAccountId: string,
    effectiveTiming: ChangeEffectiveTiming,
  ): Promise<ProrationResult> {
    try {
      const now = new Date();
      const periodEnd = new Date(subscription.current_period_end);

      // For period-end changes, no immediate charge
      if (effectiveTiming === ChangeEffectiveTiming.PERIOD_END) {
        return {
          unusedCredit: 0,
          newPlanCharge: newPrice.price_amount || 0,
          immediatePayment: 0,
          effectiveDate: periodEnd,
          nextBillingDate: periodEnd,
        };
      }

      // Get upcoming invoice preview from Stripe
      const upcomingInvoice = await this.stripeService.retrieveUpcomingInvoice(
        subscription.stripe_subscription_id,
        subscription.customer.stripe_customer_id,
        newPrice.stripe_price_id,
        stripeAccountId,
      );

      // Calculate proration from invoice line items
      let prorationCredit = 0;
      let newPlanCharge = 0;
      let hasProrationItems = false;

      for (const line of upcomingInvoice.lines.data) {
        const lineItem = line as any; // Type assertion for Stripe invoice line items

        // Check if this is a proration item
        if (lineItem.proration === true) {
          hasProrationItems = true;

          // In Stripe, proration items can be identified by their descriptions
          // Credits for unused time typically have negative amounts in the invoice
          // But line items are always positive - the direction is in the invoice level
          if (lineItem.description?.toLowerCase().includes('unused time') ||
              lineItem.description?.toLowerCase().includes('remaining time') ||
              lineItem.type === 'invoiceitem' && line.amount < 0) {
            // This is a credit for unused time
            prorationCredit += Math.abs(line.amount);
          } else {
            // This is a charge for the new plan's remaining period
            newPlanCharge += line.amount;
          }
        } else if (lineItem.price?.id === newPrice.stripe_price_id && !lineItem.proration) {
          // Regular subscription item (not proration)
          // Only count if we don't have proration items
          if (!hasProrationItems) {
            newPlanCharge += line.amount;
          }
        }
      }

      // Stripe's amount_due is the authoritative amount customer will pay
      // It already includes all credits, charges, taxes, and discounts
      const immediatePayment = Math.max(0, upcomingInvoice.amount_due || 0);

      // Log for debugging
      this.logger.log('Stripe proration calculation:', {
        prorationCredit,
        newPlanCharge,
        immediatePayment,
        invoiceTotal: upcomingInvoice.total,
        invoiceSubtotal: upcomingInvoice.subtotal,
        hasProrationItems,
        lineCount: upcomingInvoice.lines.data.length,
      });

      return {
        unusedCredit: prorationCredit,
        newPlanCharge: newPlanCharge || immediatePayment, // Fallback if no charge found
        immediatePayment: immediatePayment,
        effectiveDate: now,
        nextBillingDate: new Date(upcomingInvoice.period_end * 1000),
      };
    } catch (error) {
      this.logger.error('Error getting Stripe proration preview:', error);
      // Fallback to local calculation
      return this.calculateLocalProration(
        subscription,
        currentPrice,
        newPrice,
        effectiveTiming,
      );
    }
  }

  /**
   * Calculate proration locally (for free plans or fallback)
   */
  private calculateLocalProration(
    subscription: any,
    currentPrice: any,
    newPrice: any,
    effectiveTiming: ChangeEffectiveTiming,
  ): Promise<ProrationResult> {
    const now = new Date();
    const periodStart = new Date(subscription.current_period_start);
    const periodEnd = new Date(subscription.current_period_end);

    // For period-end changes, no immediate charge
    if (effectiveTiming === ChangeEffectiveTiming.PERIOD_END) {
      return Promise.resolve({
        unusedCredit: 0,
        newPlanCharge: newPrice.price_amount || 0,
        immediatePayment: 0,
        effectiveDate: periodEnd,
        nextBillingDate: periodEnd,
      });
    }

    const totalDays = Math.ceil(
      (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const usedDays = Math.ceil(
      (now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const remainingDays = Math.max(0, totalDays - usedDays);

    const currentAmount = currentPrice?.price_amount || 0;
    const newAmount = newPrice?.price_amount || 0;

    // Calculate prorated amounts
    const unusedCredit = Math.round((currentAmount * remainingDays) / totalDays);
    const newPlanCharge = Math.round((newAmount * remainingDays) / totalDays);
    const immediatePayment = Math.max(0, newPlanCharge - unusedCredit);

    this.logger.log(
      `Local proration: ${totalDays} days total, ${usedDays} used, ${remainingDays} remaining`,
    );
    this.logger.log(`Credit: $${unusedCredit / 100}, Charge: $${newPlanCharge / 100}, Net: $${immediatePayment / 100}`);

    return Promise.resolve({
      unusedCredit,
      newPlanCharge,
      immediatePayment,
      effectiveDate: now,
      nextBillingDate: periodEnd,
    });
  }

  /**
   * Determine if change is upgrade or downgrade
   */
  private determineChangeType(currentAmount: number, newAmount: number): 'upgrade' | 'downgrade' {
    return newAmount > currentAmount ? 'upgrade' : 'downgrade';
  }

  /**
   * Get user-friendly notes about the change
   */
  private getChangeNotes(
    changeType: 'upgrade' | 'downgrade',
    effectiveTiming: ChangeEffectiveTiming,
  ): string[] {
    const notes: string[] = [];

    if (changeType === 'upgrade') {
      if (effectiveTiming === ChangeEffectiveTiming.IMMEDIATE) {
        notes.push('Your plan will be upgraded immediately');
        notes.push('You will be charged the prorated difference today');
        notes.push('Your trial period (if any) will be preserved');
      } else {
        notes.push('Your plan will be upgraded at the end of your current billing period');
        notes.push('No charge will be made today');
      }
    } else {
      if (effectiveTiming === ChangeEffectiveTiming.IMMEDIATE) {
        notes.push('Your plan will be downgraded immediately');
        notes.push('Unused credit will be applied to your account');
      } else {
        notes.push('Your plan will be downgraded at the end of your current billing period');
        notes.push('You will keep access to your current plan until then');
        notes.push('No refund will be issued');
      }
    }

    return notes;
  }

  /**
   * Execute immediate plan change
   */
  private async executeImmediateChange(
    subscription: any,
    currentPrice: any,
    newPrice: any,
    preview: any,
    stripeAccountId?: string,
  ) {
    const supabase = this.supabaseService.getClient();
    let stripeInvoiceId: string | null = null;

    // Check if this is a free-to-paid upgrade (no Stripe subscription exists)
    const isFreeUpgrade = !subscription.stripe_subscription_id && newPrice.stripe_price_id;

    // Use transaction for atomic operations
    try {
      // Begin by handling the Stripe operations first
      if (isFreeUpgrade && stripeAccountId && subscription.customer?.stripe_customer_id) {
        // Free-to-paid upgrade: Create new Stripe subscription
        this.logger.log('Processing free-to-paid upgrade, creating new Stripe subscription');

        // Get product for trial information
        const { data: product } = await supabase
          .from('products')
          .select('trial_days')
          .eq('id', newPrice.product_id)
          .single();

        try {
          const newStripeSubscription = await this.stripeService.createSubscription(
            {
              customer: subscription.customer.stripe_customer_id,
              items: [{ price: newPrice.stripe_price_id }],
              trial_period_days: product?.trial_days || undefined,
              metadata: {
                subscription_id: subscription.id,
                organization_id: subscription.customer.organization_id,
              },
            },
            stripeAccountId,
          );

          // Update subscription with new Stripe ID and status
          const { data: updatedSubscription, error: updateError } = await supabase
            .from('subscriptions')
            .update({
              product_id: newPrice.product_id,
              amount: newPrice.price_amount || 0,
              currency: newPrice.price_currency || 'usd',
              stripe_subscription_id: newStripeSubscription.id,
              status: newStripeSubscription.status === 'trialing' ? 'trialing' : 'active',
              // Type cast period dates as Stripe types might not match our DB
              trial_end: newStripeSubscription.trial_end
                ? new Date(newStripeSubscription.trial_end * 1000).toISOString()
                : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', subscription.id)
            .select()
            .single();

          if (updateError) {
            // Attempt to cancel the Stripe subscription if DB update fails
            await this.stripeService.cancelSubscription(
              newStripeSubscription.id,
              stripeAccountId,
              false, // immediate cancellation
            );
            throw new BadRequestException('Failed to update subscription after Stripe creation');
          }

          // Cancel any other active free subscriptions for this customer
          await this.cancelOtherSubscriptions(subscription.customer_id, subscription.id);

          stripeInvoiceId = typeof newStripeSubscription.latest_invoice === 'string'
            ? newStripeSubscription.latest_invoice
            : newStripeSubscription.latest_invoice?.id || null;

          this.logger.log(`Created new Stripe subscription for free-to-paid upgrade: ${newStripeSubscription.id}`);

        } catch (stripeError) {
          this.logger.error('Failed to create Stripe subscription for free-to-paid upgrade:', stripeError);
          throw new BadRequestException('Failed to create subscription in Stripe');
        }

      } else if (subscription.stripe_subscription_id && newPrice.stripe_price_id && stripeAccountId) {
        // Paid-to-paid upgrade: Update existing Stripe subscription
        try {
          const updatedSubscription = await this.stripeService.updateSubscriptionPrice(
            subscription.stripe_subscription_id,
            newPrice.stripe_price_id,
            stripeAccountId,
          );

          // Get the latest invoice ID
          if (updatedSubscription.latest_invoice) {
            stripeInvoiceId = typeof updatedSubscription.latest_invoice === 'string'
              ? updatedSubscription.latest_invoice
              : updatedSubscription.latest_invoice.id;
          }

          this.logger.log(`Stripe subscription updated: ${subscription.stripe_subscription_id}`);
        } catch (error) {
          this.logger.error('Failed to update Stripe subscription:', error);
          throw new BadRequestException('Failed to update subscription in Stripe');
        }

        // Update subscription in database
        const { data: updatedSubscription, error: updateError } = await supabase
          .from('subscriptions')
          .update({
            product_id: newPrice.product_id,
            amount: newPrice.price_amount || 0,
            currency: newPrice.price_currency || 'usd',
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscription.id)
          .select()
          .single();

        if (updateError) {
          throw new BadRequestException('Failed to update subscription');
        }
      } else {
        // Free-to-free change or no Stripe integration
        const { data: updatedSubscription, error: updateError } = await supabase
          .from('subscriptions')
          .update({
            product_id: newPrice.product_id,
            amount: newPrice.price_amount || 0,
            currency: newPrice.price_currency || 'usd',
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscription.id)
          .select()
          .single();

        if (updateError) {
          throw new BadRequestException('Failed to update subscription');
        }

        // Cancel any other active free subscriptions for this customer
        if (!subscription.stripe_subscription_id) {
          await this.cancelOtherSubscriptions(subscription.customer_id, subscription.id);
        }
      }

      // Record the change
      const { data: change, error: changeError } = await supabase
        .from('subscription_changes')
        .insert({
          subscription_id: subscription.id,
          organization_id: subscription.customer.organization_id,
          change_type: preview.change_type,
          from_price_id: currentPrice.id,
          to_price_id: newPrice.id,
          from_amount: currentPrice.price_amount || 0,
          to_amount: newPrice.price_amount || 0,
          proration_credit: preview.proration.unused_credit,
          proration_charge: preview.proration.new_plan_charge,
          net_amount: preview.proration.immediate_payment,
          status: 'completed',
          completed_at: new Date().toISOString(),
          stripe_invoice_id: stripeInvoiceId,
        })
        .select()
        .single();

      if (changeError) {
        this.logger.error('Failed to record subscription change:', changeError);
      }

      // Get the latest subscription state
      const { data: finalSubscription } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', subscription.id)
        .single();

      this.logger.log(`Subscription ${subscription.id} changed immediately from price ${currentPrice.id} to ${newPrice.id}`);

      return {
        subscription: finalSubscription,
        change: change,
        invoice_id: stripeInvoiceId,
      };
    } catch (error) {
      this.logger.error('Error in executeImmediateChange:', error);
      throw error;
    }
  }

  /**
   * Cancel other subscriptions for the same customer
   * Used when upgrading from free to paid to ensure only one active subscription
   */
  private async cancelOtherSubscriptions(customerId: string, keepSubscriptionId: string) {
    const supabase = this.supabaseService.getClient();

    try {
      // Find all other active subscriptions for this customer
      const { data: otherSubscriptions } = await supabase
        .from('subscriptions')
        .select('id, stripe_subscription_id')
        .eq('customer_id', customerId)
        .neq('id', keepSubscriptionId)
        .in('status', ['active', 'trialing'])
        .is('deleted_at', null);

      if (!otherSubscriptions || otherSubscriptions.length === 0) {
        return; // No other subscriptions to cancel
      }

      this.logger.log(`Found ${otherSubscriptions.length} other subscriptions to cancel for customer ${customerId}`);

      // Cancel each subscription
      for (const sub of otherSubscriptions) {
        // Update database to mark as cancelled
        await supabase
          .from('subscriptions')
          .update({
            status: 'cancelled',
            canceled_at: new Date().toISOString(),
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id);

        // Revoke features for cancelled subscription
        await supabase
          .from('feature_grants')
          .update({ revoked_at: new Date().toISOString() })
          .eq('subscription_id', sub.id)
          .is('revoked_at', null);

        this.logger.log(`Cancelled duplicate subscription ${sub.id} for customer ${customerId}`);
      }
    } catch (error) {
      this.logger.error('Error cancelling other subscriptions:', error);
      // Don't throw - this is a cleanup operation that shouldn't fail the main upgrade
    }
  }

  /**
   * Schedule downgrade for end of period
   */
  private async scheduleDowngrade(
    subscription: any,
    currentPrice: any,
    newPrice: any,
    preview: any,
  ) {
    const supabase = this.supabaseService.getClient();

    // Create scheduled change
    const { data: change, error: changeError } = await supabase
      .from('subscription_changes')
      .insert({
        subscription_id: subscription.id,
        organization_id: subscription.customer.organization_id,
        change_type: 'downgrade',
        from_price_id: currentPrice.id,
        to_price_id: newPrice.id,
        from_amount: currentPrice.price_amount || 0,
        to_amount: newPrice.price_amount || 0,
        proration_credit: 0,
        proration_charge: newPrice.price_amount || 0,
        net_amount: 0,
        status: 'scheduled',
        scheduled_for: new Date(subscription.current_period_end).toISOString(),
      })
      .select()
      .single();

    if (changeError || !change) {
      throw new BadRequestException('Failed to schedule downgrade');
    }

    this.logger.log(`Downgrade scheduled for subscription ${subscription.id} at period end`);

    // TODO: Send notification email to customer

    return {
      subscription: subscription,
      change: change,
      scheduled_for: change.scheduled_for,
      message: 'Downgrade scheduled for end of billing period',
    };
  }
}
