import { Injectable, Logger, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { StripeService } from '../../stripe/stripe.service';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { UpdateCustomerDto } from '../../customers/dto/update-customer.dto';
import {
  PortalData,
  PortalSubscription,
  PortalInvoice,
  PortalPaymentMethod,
  PortalCustomer,
} from './dto/portal-data.dto';

export interface PortalSession {
  id: string;
  customerId: string;
  organizationId: string;
  expiresAt: string;
}

export interface PortalSessionStatus {
  sessionId: string;
  isValid: boolean;
  expiresAt?: string;
  customerId?: string;
}

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Create a new portal session for a customer
   */
  async createPortalSession(
    organizationId: string,
    externalUserId: string,
    dto: CreatePortalSessionDto,
  ): Promise<PortalSession> {
    const supabase = this.supabaseService.getClient();

    // 1. Get or find customer
    let customerId: string;

    if (dto.customerId) {
      // Verify customer belongs to organization
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('id', dto.customerId)
        .eq('organization_id', organizationId)
        .single();

      if (customerError || !customer) {
        throw new NotFoundException('Customer not found or does not belong to organization');
      }

      customerId = customer.id;
    } else {
      // Find customer by external_id
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('external_id', externalUserId)
        .maybeSingle();

      if (customerError) {
        this.logger.error('Error finding customer:', customerError);
        throw new NotFoundException('Customer not found');
      }

      if (!customer) {
        throw new NotFoundException(
          'Customer not found. Customer must complete checkout before accessing portal.',
        );
      }

      customerId = customer.id;
    }

    // 2. Create portal session with 24-hour expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry for portal

    const { data: portalSession, error: sessionError } = await supabase
      .from('portal_sessions')
      .insert({
        customer_id: customerId,
        organization_id: organizationId,
        external_user_id: externalUserId,
        expires_at: expiresAt.toISOString(),
        metadata: dto.metadata || {},
      })
      .select('id, customer_id, organization_id, expires_at')
      .single();

    if (sessionError || !portalSession) {
      this.logger.error('Failed to create portal session:', sessionError);
      throw new Error('Failed to create portal session');
    }

    this.logger.log(
      `Created portal session ${portalSession.id} for customer ${customerId}`,
    );

    return {
      id: portalSession.id,
      customerId: portalSession.customer_id,
      organizationId: portalSession.organization_id,
      expiresAt: portalSession.expires_at,
    };
  }

  /**
   * Get portal session status and validate
   */
  async getPortalSessionStatus(sessionId: string): Promise<PortalSessionStatus> {
    const supabase = this.supabaseService.getClient();

    const { data: session, error } = await supabase
      .from('portal_sessions')
      .select('id, customer_id, expires_at')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      return {
        sessionId,
        isValid: false,
      };
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    const isValid = expiresAt > now;

    // Update accessed_at timestamp
    if (isValid) {
      await supabase
        .from('portal_sessions')
        .update({ accessed_at: new Date().toISOString() })
        .eq('id', sessionId);
    }

    return {
      sessionId,
      isValid,
      expiresAt: session.expires_at,
      customerId: session.customer_id,
    };
  }

  /**
   * Get aggregated portal data for a session
   */
  async getPortalData(sessionId: string): Promise<PortalData> {
    const supabase = this.supabaseService.getClient();

    // 1. Validate session
    const sessionStatus = await this.getPortalSessionStatus(sessionId);
    if (!sessionStatus.isValid) {
      throw new UnauthorizedException('Portal session is invalid or expired');
    }

    const customerId = sessionStatus.customerId!;

    // 2. Get customer data
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, email, name, organization_id, organizations(name)')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      throw new NotFoundException('Customer not found');
    }

    const portalCustomer: PortalCustomer = {
      id: customer.id,
      email: customer.email || undefined,
      name: customer.name || undefined,
    };

    // 3. Get active subscriptions with product and price details
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('subscriptions')
      .select(`
        id,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        canceled_at,
        trial_end,
        product:products (
          id,
          name,
          description
        ),
        price:product_prices (
          id,
          price_amount,
          price_currency,
          recurring_interval,
          recurring_interval_count
        )
      `)
      .eq('customer_id', customerId)
      .in('status', ['active', 'trialing', 'past_due', 'canceled']);

    const portalSubscriptions: PortalSubscription[] = [];
    if (subscriptions) {
      for (const sub of subscriptions) {
        const product = sub.product as any;
        const price = sub.price as any;

        // Get features for this product
        const { data: productFeatures } = await supabase
          .from('product_features')
          .select(`
            feature:features (
              id,
              name,
              description,
              feature_type,
              limit
            )
          `)
          .eq('product_id', product.id);

        const features = (productFeatures || []).map((pf: any) => ({
          id: pf.feature.id,
          name: pf.feature.name,
          description: pf.feature.description || undefined,
          limit: pf.feature.limit || undefined,
        }));

        portalSubscriptions.push({
          id: sub.id,
          status: sub.status,
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end || false,
          canceledAt: sub.canceled_at || undefined,
          trialEnd: sub.trial_end || undefined,
          product: {
            id: product.id,
            name: product.name,
            description: product.description || undefined,
          },
          price: {
            id: price.id,
            amount: price.price_amount,
            currency: price.price_currency,
            interval: price.recurring_interval,
            intervalCount: price.recurring_interval_count || 1,
          },
          features,
        });
      }
    }

    // 4. Get invoices from Stripe
    const portalInvoices: PortalInvoice[] = [];

    // Get customer's Stripe customer ID
    const { data: customerWithStripe, error: stripeCustomerError } = await supabase
      .from('customers')
      .select('stripe_customer_id, organization_id')
      .eq('id', customerId)
      .single();

    this.logger.debug(`Customer data: stripe_customer_id=${customerWithStripe?.stripe_customer_id}`);

    if (!stripeCustomerError && customerWithStripe?.stripe_customer_id) {
      const stripeCustomerId = customerWithStripe.stripe_customer_id;

      // Get organization's account_id
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('account_id')
        .eq('id', customerWithStripe.organization_id)
        .single();

      if (!orgError && org?.account_id) {
        // Get Stripe account ID from accounts table
        const { data: account, error: accountError } = await supabase
          .from('accounts')
          .select('stripe_id')
          .eq('id', org.account_id)
          .single();

        const stripeAccountId = account?.stripe_id;

        this.logger.debug(`Stripe IDs - Customer: ${stripeCustomerId}, Account: ${stripeAccountId}`);

        if (stripeAccountId) {
          try {
            this.logger.debug(`Fetching invoices from Stripe for customer ${stripeCustomerId} in account ${stripeAccountId}`);
            const stripe = this.stripeService.getClient();
            const invoices = await stripe.invoices.list(
              {
                customer: stripeCustomerId,
                limit: 100, // Fetch last 100 invoices
              },
              { stripeAccount: stripeAccountId }
            );

            this.logger.debug(`Stripe returned ${invoices.data.length} invoices`);

            // Map Stripe invoices to PortalInvoice format
            for (const invoice of invoices.data) {
              portalInvoices.push({
                id: invoice.id,
                number: invoice.number || undefined,
                status: invoice.status || 'unknown',
                amount: invoice.amount_due || 0,
                currency: invoice.currency,
                dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : undefined,
                paidAt: invoice.status_transitions?.paid_at
                  ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
                  : undefined,
                invoiceUrl: invoice.hosted_invoice_url || undefined,
                invoicePdf: invoice.invoice_pdf || undefined,
                createdAt: new Date(invoice.created * 1000).toISOString(),
              });
            }

            this.logger.log(`✅ Fetched ${portalInvoices.length} invoices for customer ${customerId}`);
          } catch (error) {
            this.logger.error(`❌ Failed to fetch invoices from Stripe: ${error.message}`);
            this.logger.error(error.stack);
            // Don't throw - just return empty invoices array
          }
        } else {
          this.logger.warn(`⚠️ No Stripe account ID found in accounts table - cannot fetch invoices`);
        }
      } else {
        this.logger.warn(`⚠️ No account_id found for organization - cannot fetch invoices`);
      }
    } else {
      this.logger.warn(`⚠️ No Stripe customer ID found for customer ${customerId} - skipping invoice fetch`);
    }

    // 5. Get payment methods from Stripe
    const portalPaymentMethods: PortalPaymentMethod[] = [];

    if (!stripeCustomerError && customerWithStripe?.stripe_customer_id) {
      const stripeCustomerId = customerWithStripe.stripe_customer_id;

      // Get organization's Stripe account (reuse logic from invoices)
      const { data: org2 } = await supabase
        .from('organizations')
        .select('account_id')
        .eq('id', customerWithStripe.organization_id)
        .single();

      if (org2?.account_id) {
        const { data: account2 } = await supabase
          .from('accounts')
          .select('stripe_id')
          .eq('id', org2.account_id)
          .single();

        const stripeAccountId2 = account2?.stripe_id;

        if (stripeAccountId2) {
          try {
            this.logger.debug(`Fetching payment methods from Stripe for customer ${stripeCustomerId}`);

            const paymentMethods = await this.stripeService.listPaymentMethods(
              stripeCustomerId,
              'card',
              stripeAccountId2,
            );

            // Get customer to check default payment method
            const stripe = this.stripeService.getClient();
            const stripeCustomer = await stripe.customers.retrieve(
              stripeCustomerId,
              { stripeAccount: stripeAccountId2 }
            );

            const defaultPaymentMethodId = (stripeCustomer as any).invoice_settings?.default_payment_method;

            this.logger.debug(`Stripe returned ${paymentMethods.data.length} payment methods`);

            for (const pm of paymentMethods.data) {
              portalPaymentMethods.push({
                id: pm.id,
                type: pm.type,
                last4: pm.card?.last4 || '',
                brand: pm.card?.brand,
                expiryMonth: pm.card?.exp_month,
                expiryYear: pm.card?.exp_year,
                isDefault: pm.id === defaultPaymentMethodId,
              });
            }

            this.logger.log(`✅ Fetched ${portalPaymentMethods.length} payment methods for customer ${customerId}`);
          } catch (error) {
            this.logger.error(`❌ Failed to fetch payment methods from Stripe: ${error.message}`);
          }
        }
      }
    }

    // 6. Get usage metrics for metered features
    const usageMetrics: any[] = [];

    // Get all features from customer's subscriptions
    const featureIds = new Set<string>();
    for (const sub of portalSubscriptions) {
      for (const feature of sub.features) {
        featureIds.add(feature.id);
      }
    }

    if (featureIds.size > 0) {
      // Query usage_records for this customer and these features
      const { data: usageRecords } = await supabase
        .from('usage_records')
        .select(`
          feature_id,
          consumed_units,
          features (
            id,
            name,
            feature_type,
            limit
          )
        `)
        .eq('customer_id', customerId)
        .in('feature_id', Array.from(featureIds));

      // Aggregate usage by feature
      const usageByFeature = new Map<string, { name: string; limit: number | null; total: number; type: string }>();

      if (usageRecords) {
        for (const record of usageRecords) {
          const feature = record.features as any;
          if (!feature) continue;

          const existing = usageByFeature.get(feature.id);
          if (existing) {
            existing.total += record.consumed_units || 0;
          } else {
            usageByFeature.set(feature.id, {
              name: feature.name,
              limit: feature.limit,
              total: record.consumed_units || 0,
              type: feature.feature_type,
            });
          }
        }
      }

      // Convert to usage metrics array
      for (const [featureId, data] of usageByFeature.entries()) {
        const percentage = data.limit ? Math.min(100, (data.total / data.limit) * 100) : 0;

        usageMetrics.push({
          featureId,
          featureName: data.name,
          used: data.total,
          limit: data.limit,
          percentage: Math.round(percentage),
          unit: this.getFeatureUnit(data.type),
        });
      }
    }

    // 7. Get organization name
    const organizationName = (customer.organizations as any)?.name || undefined;

    return {
      sessionId,
      customer: portalCustomer,
      subscriptions: portalSubscriptions,
      invoices: portalInvoices,
      paymentMethods: portalPaymentMethods,
      usageMetrics,
      organizationName,
    };
  }

  /**
   * Helper to get display unit for feature type
   */
  private getFeatureUnit(featureType: string): string {
    switch (featureType) {
      case 'metered':
        return 'requests';
      case 'quota':
        return 'units';
      default:
        return 'usage';
    }
  }

  /**
   * Cancel a customer subscription
   */
  async cancelSubscription(sessionId: string, dto: CancelSubscriptionDto) {
    const supabase = this.supabaseService.getClient();

    // 1. Validate session
    const sessionStatus = await this.getPortalSessionStatus(sessionId);
    if (!sessionStatus.isValid) {
      throw new UnauthorizedException('Portal session is invalid or expired');
    }

    const customerId = sessionStatus.customerId!;

    // 2. Get subscription from database and verify ownership
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, customer_id, status')
      .eq('id', dto.subscriptionId)
      .eq('customer_id', customerId)
      .single();

    if (subError || !subscription) {
      throw new NotFoundException('Subscription not found or does not belong to customer');
    }

    // Check if already cancelled
    if (subscription.status === 'canceled') {
      throw new BadRequestException('Subscription is already cancelled');
    }

    // Ensure we have a Stripe subscription ID
    if (!subscription.stripe_subscription_id) {
      throw new BadRequestException('Subscription does not have a Stripe subscription ID');
    }

    const stripeSubscriptionId = subscription.stripe_subscription_id;

    // 3. Get organization's Stripe account
    const { data: customerData, error: customerErr } = await supabase
      .from('customers')
      .select('organization_id')
      .eq('id', customerId)
      .single();

    if (customerErr || !customerData) {
      throw new NotFoundException('Customer not found');
    }

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', customerData.organization_id)
      .single();

    if (orgError || !org?.account_id) {
      throw new NotFoundException('Organization account not found');
    }

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org.account_id)
      .single();

    if (!account?.stripe_id) {
      throw new BadRequestException('Stripe account not found for organization');
    }

    const stripeAccountId = account.stripe_id;

    // 4. Cancel subscription in Stripe
    try {
      const cancelAtPeriodEnd = dto.timing === 'end_of_period';

      this.logger.log(
        `Cancelling Stripe subscription ${stripeSubscriptionId} (${dto.timing})`,
      );

      const cancelledSubscription = await this.stripeService.cancelSubscription(
        stripeSubscriptionId,
        stripeAccountId,
        cancelAtPeriodEnd,
      );

      // 5. Update subscription in database
      const updateData: any = {
        cancel_at_period_end: cancelAtPeriodEnd,
        canceled_at: new Date().toISOString(),
      };

      // If immediate cancellation, update status
      if (!cancelAtPeriodEnd) {
        updateData.status = 'canceled';
      }

      // Store cancellation metadata
      const metadata: any = {};
      if (dto.reason) metadata.cancellation_reason = dto.reason;
      if (dto.feedback) metadata.cancellation_feedback = dto.feedback;

      if (Object.keys(metadata).length > 0) {
        updateData.metadata = metadata;
      }

      const { data: updatedSub, error: updateError } = await supabase
        .from('subscriptions')
        .update(updateData)
        .eq('id', dto.subscriptionId)
        .select()
        .single();

      if (updateError) {
        this.logger.error(`Failed to update subscription in database: ${updateError.message}`);
        throw new Error('Failed to update subscription');
      }

      this.logger.log(
        `✅ Successfully cancelled subscription ${dto.subscriptionId} (${dto.timing})`,
      );

      return {
        success: true,
        subscription: {
          id: updatedSub.id,
          status: updatedSub.status,
          cancelAtPeriodEnd: updatedSub.cancel_at_period_end,
          canceledAt: updatedSub.canceled_at,
          currentPeriodEnd: updatedSub.current_period_end,
        },
        message: cancelAtPeriodEnd
          ? 'Subscription will be cancelled at the end of the billing period'
          : 'Subscription cancelled immediately',
      };
    } catch (error) {
      this.logger.error(`Failed to cancel subscription in Stripe: ${error.message}`);
      throw new BadRequestException(`Failed to cancel subscription: ${error.message}`);
    }
  }

  /**
   * Update customer account details
   */
  async updateCustomer(sessionId: string, dto: UpdateCustomerDto) {
    const supabase = this.supabaseService.getClient();

    // 1. Validate session
    const sessionStatus = await this.getPortalSessionStatus(sessionId);
    if (!sessionStatus.isValid) {
      throw new UnauthorizedException('Portal session is invalid or expired');
    }

    const customerId = sessionStatus.customerId!;

    // 2. Update customer in database
    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.billing_address !== undefined) updateData.billing_address = dto.billing_address;

    const { data: updatedCustomer, error: updateError } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', customerId)
      .select('id, email, name, billing_address, stripe_customer_id, organization_id')
      .single();

    if (updateError || !updatedCustomer) {
      this.logger.error(`Failed to update customer: ${updateError?.message}`);
      throw new BadRequestException('Failed to update customer');
    }

    // 3. Update customer in Stripe (if they have a Stripe customer ID)
    if (updatedCustomer.stripe_customer_id) {
      // Get organization's Stripe account
      const { data: org } = await supabase
        .from('organizations')
        .select('account_id')
        .eq('id', updatedCustomer.organization_id)
        .single();

      if (org?.account_id) {
        const { data: account } = await supabase
          .from('accounts')
          .select('stripe_id')
          .eq('id', org.account_id)
          .single();

        const stripeAccountId = account?.stripe_id;

        if (stripeAccountId) {
          try {
            const stripeUpdateData: any = {};
            if (dto.name) stripeUpdateData.name = dto.name;
            if (dto.email) stripeUpdateData.email = dto.email;
            if (dto.billing_address) {
              stripeUpdateData.address = {
                line1: dto.billing_address.street,
                city: dto.billing_address.city,
                state: dto.billing_address.state,
                postal_code: dto.billing_address.postal_code,
                country: dto.billing_address.country,
              };
            }

            await this.stripeService.updateCustomer(
              updatedCustomer.stripe_customer_id,
              stripeUpdateData,
              stripeAccountId,
            );

            this.logger.log(`Updated Stripe customer ${updatedCustomer.stripe_customer_id}`);
          } catch (error) {
            this.logger.error(`Failed to update Stripe customer: ${error.message}`);
            // Don't throw - database is already updated
          }
        }
      }
    }

    return {
      success: true,
      customer: {
        id: updatedCustomer.id,
        email: updatedCustomer.email,
        name: updatedCustomer.name,
        billingAddress: updatedCustomer.billing_address,
      },
    };
  }

  /**
   * Create a SetupIntent for adding a payment method
   */
  async createSetupIntent(sessionId: string) {
    const supabase = this.supabaseService.getClient();

    // 1. Validate session
    const sessionStatus = await this.getPortalSessionStatus(sessionId);
    if (!sessionStatus.isValid) {
      throw new UnauthorizedException('Portal session is invalid or expired');
    }

    const customerId = sessionStatus.customerId!;

    // 2. Get customer and Stripe account
    const { data: customer } = await supabase
      .from('customers')
      .select('stripe_customer_id, organization_id')
      .eq('id', customerId)
      .single();

    if (!customer?.stripe_customer_id) {
      throw new BadRequestException('Customer does not have a Stripe customer ID');
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', customer.organization_id)
      .single();

    if (!org?.account_id) {
      throw new NotFoundException('Organization account not found');
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org.account_id)
      .single();

    if (!account?.stripe_id) {
      throw new BadRequestException('Stripe account not found');
    }

    // 3. Create SetupIntent in Stripe
    try {
      const stripe = this.stripeService.getClient();
      const setupIntent = await stripe.setupIntents.create(
        {
          customer: customer.stripe_customer_id,
          payment_method_types: ['card'],
          usage: 'off_session',
        },
        { stripeAccount: account.stripe_id }
      );

      this.logger.log(`Created SetupIntent ${setupIntent.id} for customer ${customerId}`);

      return {
        clientSecret: setupIntent.client_secret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        stripeAccount: account.stripe_id,
      };
    } catch (error) {
      this.logger.error(`Failed to create SetupIntent: ${error.message}`);
      throw new BadRequestException(`Failed to create SetupIntent: ${error.message}`);
    }
  }

  /**
   * Remove a payment method
   */
  async removePaymentMethod(sessionId: string, paymentMethodId: string) {
    const supabase = this.supabaseService.getClient();

    // 1. Validate session
    const sessionStatus = await this.getPortalSessionStatus(sessionId);
    if (!sessionStatus.isValid) {
      throw new UnauthorizedException('Portal session is invalid or expired');
    }

    const customerId = sessionStatus.customerId!;

    // 2. Get customer and Stripe account
    const { data: customer } = await supabase
      .from('customers')
      .select('stripe_customer_id, organization_id')
      .eq('id', customerId)
      .single();

    if (!customer?.stripe_customer_id) {
      throw new BadRequestException('Customer does not have a Stripe customer ID');
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', customer.organization_id)
      .single();

    if (!org?.account_id) {
      throw new NotFoundException('Organization account not found');
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org.account_id)
      .single();

    if (!account?.stripe_id) {
      throw new BadRequestException('Stripe account not found');
    }

    // 3. Detach payment method from Stripe
    try {
      await this.stripeService.detachPaymentMethod(paymentMethodId, account.stripe_id);

      this.logger.log(`Removed payment method ${paymentMethodId} for customer ${customerId}`);

      return {
        success: true,
        message: 'Payment method removed successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to remove payment method: ${error.message}`);
      throw new BadRequestException(`Failed to remove payment method: ${error.message}`);
    }
  }

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(sessionId: string, paymentMethodId: string) {
    const supabase = this.supabaseService.getClient();

    // 1. Validate session
    const sessionStatus = await this.getPortalSessionStatus(sessionId);
    if (!sessionStatus.isValid) {
      throw new UnauthorizedException('Portal session is invalid or expired');
    }

    const customerId = sessionStatus.customerId!;

    // 2. Get customer and Stripe account
    const { data: customer } = await supabase
      .from('customers')
      .select('stripe_customer_id, organization_id')
      .eq('id', customerId)
      .single();

    if (!customer?.stripe_customer_id) {
      throw new BadRequestException('Customer does not have a Stripe customer ID');
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', customer.organization_id)
      .single();

    if (!org?.account_id) {
      throw new NotFoundException('Organization account not found');
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org.account_id)
      .single();

    if (!account?.stripe_id) {
      throw new BadRequestException('Stripe account not found');
    }

    // 3. Update customer's default payment method in Stripe
    try {
      await this.stripeService.updateCustomer(
        customer.stripe_customer_id,
        {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        },
        account.stripe_id,
      );

      this.logger.log(`Set default payment method to ${paymentMethodId} for customer ${customerId}`);

      return {
        success: true,
        message: 'Default payment method updated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to set default payment method: ${error.message}`);
      throw new BadRequestException(`Failed to set default payment method: ${error.message}`);
    }
  }
}
