import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { StripeService } from '../../stripe/stripe.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { CustomersService } from '../../customers/customers.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto';
import Stripe from 'stripe';

export interface CheckoutProduct {
  name: string;
  interval: string;
  intervalCount: number;
  features: string[];
}

export interface CheckoutCustomer {
  email?: string;
  name?: string;
}

export interface CheckoutSession {
  id: string;
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  product: CheckoutProduct;
  customer: CheckoutCustomer;
  stripeAccountId?: string;
  trialDays?: number;
}

export interface CheckoutStatus {
  sessionId: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  paymentIntentId?: string;
  subscriptionId?: string;
  customerId?: string;
  errorMessage?: string;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly supabaseService: SupabaseService,
    private readonly customersService: CustomersService,
  ) {}

  async createCheckout(
    organizationId: string,
    externalUserId: string,
    dto: CreateCheckoutDto,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();

    // 1. Fetch the price and product details
    const { data: price, error: priceError } = await supabase
      .from('product_prices')
      .select(`
        *,
        product:products(*)
      `)
      .eq('id', dto.priceId)
      .eq('product.organization_id', organizationId)
      .eq('is_archived', false)
      .single();

    if (priceError || !price) {
      this.logger.error('Price not found:', priceError);
      throw new NotFoundException('Price not found or not available');
    }

    const product = price.product;
    if (!product || product.is_archived) {
      throw new NotFoundException('Product not found or not available');
    }

    // 2. First, fetch organization's Stripe Connect account ID
    const { data: organization } = await supabase
      .from('organizations')
      .select('accounts!inner(stripe_id)')
      .eq('id', organizationId)
      .single();

    if (!organization?.accounts) {
      throw new BadRequestException('Organization does not have a Stripe Connect account');
    }

    const stripeAccountId = (organization.accounts as any).stripe_id;
    if (!stripeAccountId) {
      throw new BadRequestException('Organization Stripe account not properly configured');
    }

    // 3. Get or create Stripe customer on the CONNECTED ACCOUNT
    let stripeCustomerId: string;
    let customerId: string | null = null;

    // Check if customer already exists in our database
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, stripe_customer_id')
      .eq('organization_id', organizationId)
      .eq('external_id', externalUserId)
      .maybeSingle();

    if (existingCustomer?.stripe_customer_id) {
      stripeCustomerId = existingCustomer.stripe_customer_id;
      customerId = existingCustomer.id;
    } else {
      // Create new Stripe customer on the CONNECTED ACCOUNT
      const stripeCustomer = await this.stripeService.getClient().customers.create({
        email: dto.customerEmail,
        name: dto.customerName,
        metadata: {
          organizationId,
          externalUserId,
        },
      }, {
        stripeAccount: stripeAccountId, // Create customer on connected account
      });
      stripeCustomerId = stripeCustomer.id;

      // We'll create the customer record in our database after successful payment
    }

    // 4. Create payment intent on the CONNECTED ACCOUNT with platform fee
    const amount = price.price_amount || 0;
    const currency = price.price_currency || 'usd';

    // Calculate platform fee (e.g., 5% of the transaction)
    const platformFeePercentage = 0.05; // 5% platform fee
    const applicationFeeAmount = Math.round(amount * platformFeePercentage);

    const paymentIntent = await this.stripeService.getClient().paymentIntents.create({
      amount,
      currency,
      customer: stripeCustomerId,
      setup_future_usage: 'off_session', // Save payment method for future subscriptions
      application_fee_amount: applicationFeeAmount, // Platform fee
      metadata: {
        organizationId,
        externalUserId,
        productId: product.id,
        priceId: price.id,
        productName: product.name,
        interval: price.recurring_interval,
        intervalCount: price.recurring_interval_count?.toString() || '1',
        trialDays: product.trial_days?.toString() || '0',
        ...dto.metadata,
      },
    }, {
      stripeAccount: stripeAccountId, // Create payment intent on connected account
    });

    // 5. Store payment intent in database
    const { data: paymentIntentRecord, error: piError } = await supabase
      .from('payment_intents')
      .insert({
        organization_id: organizationId,
        customer_id: customerId,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_customer_id: stripeCustomerId,
        stripe_account_id: stripeAccountId, // Store the connected account ID
        client_secret: paymentIntent.client_secret!,  // client_secret is always present for new payment intents
        amount,
        currency,
        application_fee_amount: applicationFeeAmount, // Store platform fee
        status: paymentIntent.status,
        product_id: product.id,
        price_id: price.id,
        metadata: {
          externalUserId,
          productName: product.name,
          ...dto.metadata,
        },
      })
      .select()
      .single();

    if (piError) {
      this.logger.error('Failed to store payment intent:', piError);
      // Cancel the Stripe payment intent if we can't store it
      await this.stripeService.getClient().paymentIntents.cancel(paymentIntent.id);
      throw new Error('Failed to create checkout session');
    }

    // 5. Create checkout session record
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Expire after 1 hour

    const { data: checkoutSession, error: sessionError } = await supabase
      .from('checkout_sessions')
      .insert({
        organization_id: organizationId,
        session_token: externalUserId, // Using external user ID as session identifier
        payment_intent_id: paymentIntentRecord.id,
        customer_email: dto.customerEmail,
        customer_name: dto.customerName,
        customer_external_id: externalUserId,
        expires_at: expiresAt.toISOString(),
        metadata: dto.metadata,
      })
      .select()
      .single();

    if (sessionError) {
      this.logger.error('Failed to create checkout session:', sessionError);
      throw new Error('Failed to create checkout session');
    }

    // 6. Fetch product features
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map((pf: any) => pf.features.title);

    return {
      id: checkoutSession.id,
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
      amount,
      currency,
      product: {
        name: product.name,
        interval: price.recurring_interval || 'month',
        intervalCount: price.recurring_interval_count || 1,
        features,
      },
      customer: {
        email: dto.customerEmail,
        name: dto.customerName,
      },
      stripeAccountId,
      trialDays: product.trial_days || 0,
    };
  }

  async confirmCheckout(
    clientSecret: string,
    dto: ConfirmCheckoutDto,
  ): Promise<{ status: string; requiresAction: boolean; actionUrl?: string; success: boolean; subscriptionId?: string; message?: string }> {
    try {
      // Extract payment intent ID from client secret
      const paymentIntentId = clientSecret.split('_secret_')[0];

      // Get the Stripe account ID and other details from the payment intent record
      const supabase = this.supabaseService.getClient();
      const { data: paymentIntentRecord } = await supabase
        .from('payment_intents')
        .select('*')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .single();

      if (!paymentIntentRecord?.stripe_account_id) {
        throw new BadRequestException('Payment intent not found or invalid');
      }

      // RETRIEVE the payment intent from Stripe (don't confirm - it's already confirmed by the frontend)
      const paymentIntent = await this.stripeService.getClient().paymentIntents.retrieve(
        paymentIntentId,
        {
          stripeAccount: paymentIntentRecord.stripe_account_id,
        }
      );

      this.logger.log(`Payment Intent ${paymentIntentId} status: ${paymentIntent.status}`);

      // Update status in our database
      await supabase
        .from('payment_intents')
        .update({
          status: paymentIntent.status,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', paymentIntentId);

      // Check if payment succeeded
      if (paymentIntent.status === 'succeeded') {
        // Create customer record if it doesn't exist yet
        let customerId = paymentIntentRecord.customer_id;

        if (!customerId) {
          const metadata = paymentIntentRecord.metadata as any;
          const externalUserId = metadata?.externalUserId;

          if (!externalUserId) {
            this.logger.error('Missing externalUserId in payment intent metadata');
            return {
              status: 'succeeded',
              requiresAction: false,
              success: false,
              message: 'Payment succeeded but failed to create customer',
            };
          }

          // Get customer email from checkout session
          const { data: checkoutSession } = await supabase
            .from('checkout_sessions')
            .select('customer_email, customer_name')
            .eq('payment_intent_id', paymentIntentRecord.id)
            .single();

          if (!checkoutSession?.customer_email) {
            this.logger.error('Missing customer email in checkout session');
            return {
              status: 'succeeded',
              requiresAction: false,
              success: false,
              message: 'Payment succeeded but failed to create customer',
            };
          }

          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              organization_id: paymentIntentRecord.organization_id,
              external_id: externalUserId,
              email: checkoutSession.customer_email,
              name: checkoutSession.customer_name,
              stripe_customer_id: paymentIntentRecord.stripe_customer_id,
            })
            .select()
            .single();

          if (customerError || !newCustomer) {
            this.logger.error('Failed to create customer:', customerError);
            return {
              status: 'succeeded',
              requiresAction: false,
              success: false,
              message: 'Payment succeeded but failed to create customer',
            };
          }

          customerId = newCustomer.id;
        }

        // Verify product_id exists (should always be present)
        if (!paymentIntentRecord.product_id) {
          this.logger.error('Missing product_id in payment intent record');
          return {
            status: 'succeeded',
            requiresAction: false,
            success: false,
            message: 'Payment succeeded but failed to create subscription',
          };
        }

        // Payment succeeded - create subscription
        const subscriptionData = {
          organization_id: paymentIntentRecord.organization_id,
          customer_id: customerId,
          product_id: paymentIntentRecord.product_id,
          price_id: paymentIntentRecord.price_id,
          stripe_subscription_id: paymentIntent.id, // Using payment intent ID for now
          payment_intent_id: paymentIntentRecord.id,
          status: 'active',
          amount: paymentIntentRecord.amount,
          currency: paymentIntentRecord.currency,
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        };

        const { data: subscription, error: subError } = await supabase
          .from('subscriptions')
          .insert(subscriptionData)
          .select()
          .single();

        if (subError) {
          this.logger.error('Failed to create subscription:', subError);
          return {
            status: 'succeeded',
            requiresAction: false,
            success: false,
            message: 'Payment succeeded but failed to create subscription',
          };
        }

        return {
          status: 'succeeded',
          requiresAction: false,
          success: true,
          subscriptionId: subscription.id,
        };
      }

      // Check if additional action is required (3D Secure, etc.)
      if (paymentIntent.status === 'requires_action' &&
          paymentIntent.next_action?.type === 'redirect_to_url' &&
          paymentIntent.next_action.redirect_to_url?.url) {
        return {
          status: 'requires_action',
          requiresAction: true,
          actionUrl: paymentIntent.next_action.redirect_to_url.url,
          success: false,
        };
      }

      return {
        status: paymentIntent.status,
        requiresAction: false,
        success: false,
      };
    } catch (error) {
      this.logger.error('Failed to confirm payment:', error);
      throw new BadRequestException('Failed to confirm payment');
    }
  }

  async getCheckoutStatus(sessionId: string): Promise<CheckoutStatus> {
    const supabase = this.supabaseService.getClient();

    // Fetch checkout session with payment intent details
    const { data: session, error: sessionError } = await supabase
      .from('checkout_sessions')
      .select(`
        *,
        payment_intent:payment_intents(*)
      `)
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new NotFoundException('Checkout session not found');
    }

    // Check if session has expired
    if (new Date(session.expires_at) < new Date() && !session.completed_at) {
      return {
        sessionId,
        status: 'canceled',
        errorMessage: 'Checkout session expired',
      };
    }

    const paymentIntent = session.payment_intent;
    if (!paymentIntent) {
      return {
        sessionId,
        status: 'pending',
      };
    }

    // Map Stripe status to our simplified status
    let status: CheckoutStatus['status'] = 'pending';
    if (paymentIntent.status === 'succeeded') {
      status = 'succeeded';
    } else if (paymentIntent.status === 'processing') {
      status = 'processing';
    } else if (paymentIntent.status === 'canceled') {
      status = 'canceled';
    } else if (paymentIntent.status.includes('failed')) {
      status = 'failed';
    }

    // Check for associated subscription if payment succeeded
    let subscriptionId: string | undefined;
    let customerId: string | undefined;

    if (status === 'succeeded') {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('id, customer_id')
        .eq('payment_intent_id', paymentIntent.id)
        .maybeSingle();

      if (subscription) {
        subscriptionId = subscription.id;
        customerId = subscription.customer_id;
      }
    }

    return {
      sessionId,
      status,
      paymentIntentId: paymentIntent.stripe_payment_intent_id,
      subscriptionId,
      customerId,
      errorMessage: status === 'failed' ? 'Payment failed' : undefined,
    };
  }

  async cleanupExpiredSessions(): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // Mark expired sessions as canceled
    await supabase
      .from('checkout_sessions')
      .update({
        metadata: { expired: true },
        updated_at: new Date().toISOString(),
      })
      .lt('expires_at', new Date().toISOString())
      .is('completed_at', null);
  }
}