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
  totalAmount: number; // Total amount after discounts and taxes
  product: CheckoutProduct;
  customer: CheckoutCustomer;
  stripeAccountId?: string;
  trialDays?: number;
  subscription?: {
    id: string;
    customerId: string;
    productId: string;
    priceId: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };
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

    // 3. Get or create customer in database and Stripe
    let stripeCustomerId: string;
    let customerId: string;

    // Check if customer already exists in our database
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, stripe_customer_id')
      .eq('organization_id', organizationId)
      .eq('external_id', externalUserId)
      .maybeSingle();

    // Handle both direct fields and nested customer object for backward compatibility
    const customerEmail = dto.customerEmail || dto.customer?.email;
    const customerName = dto.customerName || dto.customer?.name;

    // Debug logging
    this.logger.log('Customer data received:', {
      dtoCustomerEmail: dto.customerEmail,
      dtoCustomerName: dto.customerName,
      dtoCustomerObject: dto.customer,
      finalEmail: customerEmail,
      finalName: customerName,
    });

    if (existingCustomer?.stripe_customer_id) {
      // Customer already exists with Stripe ID
      stripeCustomerId = existingCustomer.stripe_customer_id;
      customerId = existingCustomer.id;
    } else {
      // Create new Stripe customer on the CONNECTED ACCOUNT
      const stripeCustomer = await this.stripeService.getClient().customers.create({
        email: customerEmail,
        name: customerName,
        metadata: {
          organizationId,
          externalUserId,
        },
      }, {
        stripeAccount: stripeAccountId, // Create customer on connected account
      });
      stripeCustomerId = stripeCustomer.id;

      // Create or update customer in our database immediately to avoid race conditions
      const customerResult = await this.customersService.upsertCustomer({
        organization_id: organizationId,
        external_id: externalUserId,
        email: customerEmail || '',
        name: customerName,
        stripe_customer_id: stripeCustomerId,
        metadata: dto.metadata,
      });
      customerId = customerResult.id;
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
        customerEmail: dto.customerEmail || null,
        customerName: dto.customerName || null,
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
        customer_id: customerId, // Now we always have a customer ID
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
      this.logger.error('Payment intent details:', {
        stripePaymentIntentId: paymentIntent.id,
        organizationId,
        customerId,
        amount,
        errorCode: piError.code,
        errorDetails: piError.details,
      });

      // Cancel the Stripe payment intent if we can't store it
      try {
        await this.stripeService.getClient().paymentIntents.cancel(paymentIntent.id);
        this.logger.warn(`Cancelled Stripe payment intent ${paymentIntent.id} due to database error`);
      } catch (cancelError) {
        this.logger.error('Failed to cancel payment intent after database error:', cancelError);
      }

      throw new BadRequestException(
        `Failed to create checkout session: ${piError.message || 'Database error occurred'}`,
      );
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
        customer_email: customerEmail,
        customer_name: customerName,
        customer_external_id: externalUserId,
        expires_at: expiresAt.toISOString(),
        metadata: dto.metadata,
      })
      .select()
      .single();

    if (sessionError) {
      this.logger.error('Failed to create checkout session:', sessionError);
      this.logger.error('Checkout session details:', {
        paymentIntentId: paymentIntentRecord.id,
        organizationId,
        customerEmail: dto.customerEmail,
        errorCode: sessionError.code,
        errorDetails: sessionError.details,
      });

      throw new BadRequestException(
        `Failed to create checkout session: ${sessionError.message || 'Database error occurred'}`,
      );
    }

    // 6. Fetch product features
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map((pf: any) => pf.features.title);

    // Calculate total amount (for now, same as amount since we don't have discounts/tax yet)
    const totalAmount = amount;

    return {
      id: checkoutSession.id,
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
      amount,
      currency,
      totalAmount, // Add totalAmount for frontend display
      product: {
        name: product.name,
        interval: price.recurring_interval || 'month',
        intervalCount: price.recurring_interval_count || 1,
        features,
      },
      customer: {
        email: customerEmail,
        name: customerName,
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
        // DON'T create subscription here - the webhook handler will do it properly
        // The webhook creates the actual Stripe subscription and syncs it to our database

        this.logger.log(
          `Payment succeeded for intent ${paymentIntentId}. Subscription will be created by webhook handler.`,
        );

        // Mark checkout session as completed
        await supabase
          .from('checkout_sessions')
          .update({
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('payment_intent_id', paymentIntentRecord.id);

        return {
          status: 'succeeded',
          requiresAction: false,
          success: true,
          message: 'Payment successful! Your subscription is being activated.',
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
      this.logger.error('Error details:', {
        clientSecret: clientSecret.substring(0, 20) + '...', // Log partial secret for debugging
        paymentMethodId: dto.paymentMethodId,
        errorMessage: error.message,
        errorStack: error.stack,
      });

      // Provide more specific error messages
      if (error.type === 'StripeCardError') {
        throw new BadRequestException(`Card error: ${error.message}`);
      } else if (error.type === 'StripeInvalidRequestError') {
        throw new BadRequestException(`Invalid request: ${error.message}`);
      } else if (error.type === 'StripeAPIError') {
        throw new BadRequestException('Payment service temporarily unavailable. Please try again.');
      }

      throw new BadRequestException(
        `Failed to confirm payment: ${error.message || 'Unknown error occurred'}`,
      );
    }
  }

  async getCheckoutStatus(sessionId: string): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();

    // Fetch checkout session with all related data
    const { data: session, error: sessionError } = await supabase
      .from('checkout_sessions')
      .select(`
        *,
        payment_intent:payment_intents(
          *,
          price:product_prices(*),
          product:products(*)
        )
      `)
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new NotFoundException('Checkout session not found');
    }

    const paymentIntent = session.payment_intent;
    if (!paymentIntent) {
      throw new NotFoundException('Payment intent not found for session');
    }

    const product = paymentIntent.product;
    const price = paymentIntent.price;

    if (!product || !price) {
      throw new NotFoundException('Product or price information not found');
    }

    // Check if session has expired
    const isExpired = new Date(session.expires_at) < new Date() && !session.completed_at;

    // Fetch product features
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map((pf: any) => pf.features.title);

    // Check if subscription exists for this payment intent
    let subscription: any = null;
    if (paymentIntent.stripe_payment_intent_id) {
      const { data: subscriptionData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('payment_intent_id', paymentIntent.id)
        .single();

      subscription = subscriptionData;
    }

    // Map Stripe status to our status
    let status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired' = 'pending';
    if (isExpired) {
      status = 'expired';
    } else if (paymentIntent.status === 'succeeded') {
      status = 'completed';
    } else if (paymentIntent.status === 'processing') {
      status = 'processing';
    } else if (paymentIntent.status === 'canceled' || paymentIntent.status.includes('failed')) {
      status = 'failed';
    }

    // Calculate total amount (for now, same as amount since we don't have discounts/tax yet)
    const totalAmount = paymentIntent.amount;

    // Debug logging for customer data
    this.logger.log('Returning session status with customer data:', {
      sessionId,
      customerEmail: session.customer_email,
      customerName: session.customer_name,
      hasEmail: !!session.customer_email,
      hasName: !!session.customer_name,
    });

    // Return full checkout session data for the frontend
    // Convert null to undefined for TypeScript compatibility
    return {
      id: sessionId,
      clientSecret: paymentIntent.client_secret || '',
      paymentIntentId: paymentIntent.stripe_payment_intent_id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      totalAmount, // Add totalAmount for frontend display
      product: {
        name: product.name,
        interval: price.recurring_interval || 'month',
        intervalCount: price.recurring_interval_count || 1,
        features,
      },
      customer: {
        email: session.customer_email || undefined,
        name: session.customer_name || undefined,
      },
      stripeAccountId: paymentIntent.stripe_account_id || undefined,
      trialDays: product.trial_days || 0,
      subscription: subscription ? {
        id: subscription.id,
        customerId: subscription.customer_id,
        productId: subscription.product_id,
        priceId: subscription.price_id,
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      } : undefined,
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