import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { StripeService } from '../../stripe/stripe.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { CustomersService } from '../../customers/customers.service';
import { CheckoutMetadataService } from './checkout-metadata.service';
import { RedisService } from '../../redis/redis.service';
import { QueueService } from '../../queue/queue.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto';

export interface CheckoutProduct {
  name: string;
  description?: string;
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
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  expiresAt?: string;
  product: CheckoutProduct;
  customer: CheckoutCustomer;
  stripeAccountId?: string;
  trialDays?: number;
  checkoutMode?: 'standard' | 'adaptive' | 'free' | 'trial';
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
    private readonly metadataService: CheckoutMetadataService,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
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
      .select(
        `
        *,
        product:products(*)
      `,
      )
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
      throw new BadRequestException(
        'Organization does not have a Stripe Connect account',
      );
    }

    const stripeAccountId = (organization.accounts as any).stripe_id;
    if (!stripeAccountId) {
      throw new BadRequestException(
        'Organization Stripe account not properly configured',
      );
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
      const stripeCustomer = await this.stripeService
        .getClient()
        .customers.create(
          {
            email: customerEmail,
            name: customerName,
            metadata: {
              organizationId,
              externalUserId,
            },
          },
          {
            stripeAccount: stripeAccountId, // Create customer on connected account
          },
        );
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

    // 4. Check for existing active subscription (prevent duplicate checkouts)
    if (!dto.existingSubscriptionId) {
      const { data: existingSubs } = await supabase
        .from('subscriptions')
        .select('id, status, created_at')
        .eq('customer_id', customerId)
        .eq('product_id', product.id)
        .in('status', ['active', 'trialing', 'past_due', 'incomplete']);

      if (existingSubs && existingSubs.length > 0) {
        // Reject if customer has active/trialing/past_due subscription
        const activeSub = existingSubs.find((s) =>
          ['active', 'trialing', 'past_due'].includes(s.status),
        );
        if (activeSub) {
          throw new BadRequestException(
            'Customer already has an active subscription for this product',
          );
        }

        // Clean up stale incomplete subscriptions (older than 1 hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const staleSubs = existingSubs.filter(
          (s) =>
            s.status === 'incomplete' &&
            s.created_at &&
            new Date(s.created_at) < oneHourAgo,
        );
        for (const staleSub of staleSubs) {
          // Cancel on Stripe if possible
          const { data: staleSubData } = await supabase
            .from('subscriptions')
            .select('stripe_subscription_id')
            .eq('id', staleSub.id)
            .single();

          if (staleSubData?.stripe_subscription_id) {
            try {
              await this.stripeService.cancelSubscription(
                staleSubData.stripe_subscription_id,
                stripeAccountId,
              );
            } catch (cancelErr) {
              this.logger.warn(
                `Failed to cancel stale incomplete subscription ${staleSubData.stripe_subscription_id}:`,
                cancelErr,
              );
            }
          }
          await supabase
            .from('subscriptions')
            .update({ status: 'canceled' })
            .eq('id', staleSub.id);
          this.logger.log(
            `Cleaned up stale incomplete subscription ${staleSub.id}`,
          );
        }
      }
    }

    // 5. Check if this is a free product
    const amount = price.price_amount || 0;
    const currency = price.price_currency || 'usd';
    const isFreeProduct = price.amount_type === 'free' || amount === 0;

    // Handle free products differently
    if (isFreeProduct) {
      return this.handleFreeCheckout(
        organizationId,
        externalUserId,
        product,
        price,
        stripeCustomerId,
        customerId,
        customerEmail,
        customerName,
        dto.metadata,
      );
    }

    // Handle adaptive pricing (Stripe Checkout Session with currency selector)
    if (dto.adaptivePricing) {
      return this.handleAdaptiveCheckout(
        organizationId,
        externalUserId,
        product,
        price,
        stripeCustomerId,
        stripeAccountId,
        customerId,
        customerEmail,
        customerName,
        dto,
      );
    }

    // Handle trial products — use SetupIntent instead of PaymentIntent ($0 upfront)
    const isTrialProduct = (product.trial_days || 0) > 0;
    if (isTrialProduct) {
      return this.handleTrialCheckout(
        organizationId,
        externalUserId,
        product,
        price,
        stripeCustomerId,
        stripeAccountId,
        customerId,
        customerEmail,
        customerName,
        dto,
      );
    }

    // Create metadata record (Autum pattern - store data separately from Stripe)
    const checkoutMetadata = await this.metadataService.createMetadata({
      organizationId,
      customerId,
      productId: product.id,
      priceId: price.id,
      customerEmail: customerEmail || '',
      customerName: customerName || undefined,
      productName: product.name,
      priceAmount: amount,
      currency,
      billingInterval: price.recurring_interval as 'month' | 'year' | undefined,
      billingIntervalCount: price.recurring_interval_count || 1,
      trialPeriodDays: product.trial_days || undefined,
      shouldGrantTrial: false,
      featuresToGrant: [],
      successUrl:
        dto.successUrl || `${process.env.APP_URL}/dashboard/billing/success`,
      cancelUrl:
        dto.cancelUrl || `${process.env.APP_URL}/dashboard/billing/cancel`,
      metadata: {
        externalUserId,
        ...dto.metadata,
      },
    });

    // --- Direct Subscription Creation (Autumn pattern) ---
    // Instead of creating a standalone PaymentIntent, create the subscription directly.
    // Stripe generates a PaymentIntent from the subscription's first invoice.
    // The client confirms THAT PaymentIntent — single atomic charge, no double-billing.

    const stripePriceId = price.stripe_price_id;
    if (!stripePriceId) {
      throw new BadRequestException('Product price is not linked to Stripe');
    }

    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: stripeCustomerId,
      items: [{ price: stripePriceId }],
      payment_behavior: 'default_incomplete', // Invoice created but not auto-charged
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      application_fee_percent: 5, // 5% platform fee on every invoice
      expand: ['latest_invoice'],
      metadata: {
        metadataId: checkoutMetadata.id,
        organizationId,
        externalUserId,
        customerId,
        productId: product.id,
        priceId: price.id,
      },
    };

    let stripeSubscription: Stripe.Subscription;
    try {
      const idempotencyKey = `sub-create:${customerId}:${product.id}:${Date.now()}`;
      stripeSubscription = await this.stripeService.createSubscription(
        subscriptionParams,
        stripeAccountId,
        idempotencyKey,
      );
    } catch (subError) {
      this.logger.error('Failed to create Stripe subscription:', subError);
      throw new BadRequestException(
        'Failed to create subscription with Stripe',
      );
    }

    // Extract the PaymentIntent from the subscription's first invoice.
    // In Stripe API 2025-12-15.clover, invoice.payment_intent was removed.
    // Payment intents are now accessed via invoice.payments.data[].payment.payment_intent.
    const invoice = stripeSubscription.latest_invoice as Stripe.Invoice;

    // Retrieve the invoice with the payment intent expanded
    const stripeClient = this.stripeService.getClient();
    const expandedInvoice = await stripeClient.invoices.retrieve(
      invoice.id,
      { expand: ['payments.data.payment.payment_intent'] },
      { stripeAccount: stripeAccountId },
    );

    const firstPayment = (expandedInvoice as any).payments?.data?.[0];
    const paymentIntent = firstPayment?.payment?.payment_intent as
      | Stripe.PaymentIntent
      | undefined;

    if (!paymentIntent?.client_secret) {
      this.logger.error('No PaymentIntent found on subscription invoice', {
        subscriptionId: stripeSubscription.id,
        invoiceId: invoice.id,
        paymentsData: (expandedInvoice as any).payments?.data,
      });
      // Clean up: cancel the subscription
      try {
        await this.stripeService.cancelSubscription(
          stripeSubscription.id,
          stripeAccountId,
        );
      } catch (e) {
        this.logger.error('Failed to cancel orphaned subscription:', e);
      }
      throw new BadRequestException('Failed to initialize payment');
    }

    // Link metadata to the subscription's payment intent
    await this.metadataService.linkToCheckoutSession(
      checkoutMetadata.id,
      paymentIntent.id,
    );

    // Store payment intent record in database
    const applicationFeeAmount = Math.round(amount * 0.05);
    const { data: paymentIntentRecord, error: piError } = await supabase
      .from('payment_intents')
      .insert({
        organization_id: organizationId,
        customer_id: customerId,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_customer_id: stripeCustomerId,
        stripe_account_id: stripeAccountId,
        stripe_subscription_id: stripeSubscription.id,
        client_secret: paymentIntent.client_secret,
        amount,
        currency,
        application_fee_amount: applicationFeeAmount,
        status: paymentIntent.status,
        product_id: product.id,
        price_id: price.id,
        metadata: {
          metadataId: checkoutMetadata.id,
          externalUserId,
          productName: product.name,
          subscriptionCreatedDuringCheckout: true,
          ...dto.metadata,
        },
      })
      .select()
      .single();

    if (piError) {
      this.logger.error('Failed to store payment intent:', piError);

      // Cancel the Stripe subscription if we can't store the PI
      try {
        await this.stripeService.cancelSubscription(
          stripeSubscription.id,
          stripeAccountId,
        );
        this.logger.warn(
          `Cancelled Stripe subscription ${stripeSubscription.id} due to database error`,
        );
      } catch (cancelError) {
        this.logger.error(
          'Failed to cancel subscription after database error:',
          cancelError,
        );
      }

      throw new BadRequestException(
        `Failed to create checkout session: ${piError.message || 'Database error occurred'}`,
      );
    }

    // Store subscription record in database (status: incomplete, pending payment)
    const subData = stripeSubscription as any;
    const { error: subDbError } = await supabase.from('subscriptions').insert({
      customer_id: customerId,
      organization_id: organizationId,
      product_id: product.id,
      price_id: price.id,
      stripe_subscription_id: stripeSubscription.id,
      status: stripeSubscription.status, // 'incomplete'
      current_period_start: subData.current_period_start
        ? new Date(subData.current_period_start * 1000).toISOString()
        : new Date().toISOString(),
      current_period_end: subData.current_period_end
        ? new Date(subData.current_period_end * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
      amount,
      currency,
      payment_intent_id: paymentIntentRecord.id,
      metadata: {
        created_from: 'direct_subscription_checkout',
        metadataId: checkoutMetadata.id,
        externalUserId,
      },
    });

    if (subDbError) {
      this.logger.error(
        'Failed to store subscription in database:',
        subDbError,
      );
      // Cancel the Stripe subscription since we can't track it in our DB
      try {
        await this.stripeService.cancelSubscription(
          stripeSubscription.id,
          stripeAccountId,
        );
        this.logger.warn(
          `Cancelled Stripe subscription ${stripeSubscription.id} due to DB insert failure`,
        );
      } catch (cancelError) {
        this.logger.error(
          'Failed to cancel Stripe subscription after DB error — inserting into reconciliation queue:',
          cancelError,
        );
        // Send to reconciliation queue for auto-cleanup
        await this.queueService.sendReconciliation({
          type: 'orphaned_stripe_subscription',
          reference_id: stripeSubscription.id,
          priority: 2,
          details: {
            stripe_subscription_id: stripeSubscription.id,
            stripe_account_id: stripeAccountId,
            customer_id: customerId,
            product_id: product.id,
            error:
              cancelError instanceof Error
                ? cancelError.message
                : String(cancelError),
          },
          organization_id: organizationId,
          created_by: 'checkout.service',
        });
      }
    }

    // Create checkout session record
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const { data: checkoutSession, error: sessionError } = await supabase
      .from('checkout_sessions')
      .insert({
        organization_id: organizationId,
        session_token: externalUserId,
        payment_intent_id: paymentIntentRecord.id,
        stripe_subscription_id: stripeSubscription.id,
        customer_email: customerEmail,
        customer_name: customerName,
        customer_external_id: externalUserId,
        expires_at: expiresAt.toISOString(),
        metadata: {
          ...dto.metadata,
          checkoutMode: 'standard',
          stripeSubscriptionId: stripeSubscription.id,
          stripeAccountId,
          existingSubscriptionId: dto.existingSubscriptionId,
        },
      })
      .select()
      .single();

    if (sessionError) {
      this.logger.error('Failed to create checkout session:', sessionError);
      // Cancel the Stripe subscription since the checkout session can't be tracked
      try {
        await this.stripeService.cancelSubscription(
          stripeSubscription.id,
          stripeAccountId,
        );
        this.logger.warn(
          `Cancelled Stripe subscription ${stripeSubscription.id} due to checkout session DB error`,
        );
      } catch (cancelError) {
        this.logger.error(
          'Failed to cancel Stripe subscription after checkout session error:',
          cancelError,
        );
        await this.queueService.sendReconciliation({
          type: 'orphaned_stripe_subscription',
          reference_id: stripeSubscription.id,
          priority: 2,
          details: {
            stripe_subscription_id: stripeSubscription.id,
            stripe_account_id: stripeAccountId,
            customer_id: customerId,
            product_id: product.id,
          },
          organization_id: organizationId,
          created_by: 'checkout.service',
        });
      }
      throw new BadRequestException(
        `Failed to create checkout session: ${sessionError.message || 'Database error occurred'}`,
      );
    }

    // Fetch product features
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    return {
      id: checkoutSession.id,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount,
      currency,
      totalAmount: amount,
      checkoutMode: 'standard' as const,
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
  ): Promise<{
    status: string;
    requiresAction: boolean;
    actionUrl?: string;
    success: boolean;
    subscriptionId?: string;
    message?: string;
  }> {
    try {
      // Handle free checkouts (empty client secret)
      if (!clientSecret || clientSecret === '') {
        // For free products, just return success
        return {
          status: 'succeeded',
          requiresAction: false,
          success: true,
          message: 'Free product activated successfully!',
        };
      }

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
      const paymentIntent = await this.stripeService
        .getClient()
        .paymentIntents.retrieve(paymentIntentId, {
          stripeAccount: paymentIntentRecord.stripe_account_id,
        });

      this.logger.log(
        `Payment Intent ${paymentIntentId} status: ${paymentIntent.status}`,
      );

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
      if (
        paymentIntent.status === 'requires_action' &&
        paymentIntent.next_action?.type === 'redirect_to_url' &&
        paymentIntent.next_action.redirect_to_url?.url
      ) {
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
      const errorDetails =
        error instanceof Error
          ? error
          : new Error(
              typeof error === 'string' ? error : 'Unknown error occurred',
            );
      const stripeErrorType =
        typeof error === 'object' &&
        error !== null &&
        'type' in error &&
        typeof error.type === 'string'
          ? error.type
          : undefined;

      this.logger.error('Failed to confirm payment:', error);
      this.logger.error('Error details:', {
        clientSecret: clientSecret.substring(0, 20) + '...', // Log partial secret for debugging
        paymentMethodId: dto.paymentMethodId,
        errorMessage: errorDetails.message,
        errorStack: errorDetails.stack,
      });

      // Provide more specific error messages
      if (stripeErrorType === 'StripeCardError') {
        throw new BadRequestException(`Card error: ${errorDetails.message}`);
      } else if (stripeErrorType === 'StripeInvalidRequestError') {
        throw new BadRequestException(
          `Invalid request: ${errorDetails.message}`,
        );
      } else if (stripeErrorType === 'StripeAPIError') {
        throw new BadRequestException(
          'Payment service temporarily unavailable. Please try again.',
        );
      }

      throw new BadRequestException(
        `Failed to confirm payment: ${errorDetails.message}`,
      );
    }
  }

  async getCheckoutStatus(sessionId: string): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();

    // Fetch checkout session with all related data
    const { data: session, error: sessionError } = await supabase
      .from('checkout_sessions')
      .select(
        `
        *,
        payment_intent:payment_intents(
          *,
          price:product_prices(*),
          product:products(*)
        )
      `,
      )
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new NotFoundException('Checkout session not found');
    }

    // Handle free product sessions (no payment intent)
    const metadata = session.metadata as any;
    const sessionWithSubscription = session as any; // Type cast for new subscription_id field
    if (!session.payment_intent && metadata?.isFreeProduct) {
      // Check if subscription has been created (after user confirmation)
      if (sessionWithSubscription.subscription_id) {
        // Subscription exists - return full subscription data
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select(
            `
            *,
            product:products(*),
            price:product_prices(*)
          `,
          )
          .eq('id', sessionWithSubscription.subscription_id)
          .single();

        if (subscription) {
          const product = subscription.product;
          const price = subscription.price;

          if (!product || !price) {
            throw new NotFoundException(
              'Product or price not found for free subscription',
            );
          }

          // Fetch product features
          const { data: productFeatures } = await supabase
            .from('product_features')
            .select('features(title, properties)')
            .eq('product_id', product.id)
            .order('display_order', { ascending: true });

          const features = (productFeatures || []).map(
            (pf: any) => pf.features.title,
          );

          // Return free checkout session status with subscription
          return {
            id: sessionId,
            clientSecret: '',
            paymentIntentId: '',
            amount: 0,
            currency: price.price_currency || 'usd',
            totalAmount: 0,
            status: session.completed_at ? 'completed' : 'pending',
            expiresAt: session.expires_at,
            product: {
              name: product.name,
              description: product.description || undefined,
              interval: price.recurring_interval || 'month',
              intervalCount: price.recurring_interval_count || 1,
              features,
            },
            customer: {
              email: session.customer_email || undefined,
              name: session.customer_name || undefined,
            },
            stripeAccountId: undefined,
            trialDays: 0,
            subscription: {
              id: subscription.id,
              customerId: subscription.customer_id,
              productId: subscription.product_id,
              priceId: subscription.price_id || '',
              status: subscription.status,
              currentPeriodStart: subscription.current_period_start,
              currentPeriodEnd: subscription.current_period_end,
              cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
            },
          };
        }
      } else {
        // No subscription yet (user hasn't confirmed) - return session data from metadata
        const productId = metadata.productId;
        const priceId = metadata.priceId;

        if (!productId || !priceId) {
          throw new BadRequestException(
            'Product or price ID missing in session metadata',
          );
        }

        // Fetch product and price details
        const { data: product } = await supabase
          .from('products')
          .select('*')
          .eq('id', productId)
          .single();

        const { data: price } = await supabase
          .from('product_prices')
          .select('*')
          .eq('id', priceId)
          .single();

        if (!product || !price) {
          throw new NotFoundException('Product or price not found');
        }

        // Fetch product features
        const { data: productFeatures } = await supabase
          .from('product_features')
          .select('features(title, properties)')
          .eq('product_id', product.id)
          .order('display_order', { ascending: true });

        const features = (productFeatures || []).map(
          (pf: any) => pf.features.title,
        );

        // Return free checkout session WITHOUT subscription (pending user confirmation)
        return {
          id: sessionId,
          clientSecret: '',
          paymentIntentId: '',
          amount: 0,
          currency: price.price_currency || 'usd',
          totalAmount: 0,
          status:
            new Date(session.expires_at) < new Date() && !session.completed_at
              ? 'expired'
              : 'pending',
          expiresAt: session.expires_at,
          product: {
            name: product.name,
            description: product.description || undefined,
            interval: price.recurring_interval || 'month',
            intervalCount: price.recurring_interval_count || 1,
            features,
          },
          customer: {
            email: session.customer_email || undefined,
            name: session.customer_name || undefined,
          },
          stripeAccountId: undefined,
          trialDays: 0,
          // No subscription field - user hasn't confirmed yet
        };
      }
    }

    // Handle adaptive checkout sessions (no payment_intent row)
    if (!session.payment_intent && metadata?.checkoutMode === 'adaptive') {
      return this.getAdaptiveCheckoutStatus(session, metadata);
    }

    // Handle trial checkout sessions (no payment_intent row — uses SetupIntent)
    if (!session.payment_intent && metadata?.checkoutMode === 'trial') {
      return this.getTrialCheckoutStatus(session, metadata);
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
    const isExpired =
      new Date(session.expires_at) < new Date() && !session.completed_at;

    // Fetch product features
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    // Check if subscription exists for this payment intent
    // Only return subscriptions that are ready (not still in 'incomplete' status)
    let subscription: any = null;
    if (paymentIntent.stripe_payment_intent_id) {
      const { data: subscriptionData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('payment_intent_id', paymentIntent.id)
        .single();

      // Filter out incomplete subscriptions — frontend polls until subscription is active
      if (subscriptionData && subscriptionData.status !== 'incomplete') {
        subscription = subscriptionData;
      }
    }

    // Map Stripe status to our status
    let status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired' =
      'pending';
    if (isExpired) {
      status = 'expired';
    } else if (paymentIntent.status === 'succeeded') {
      status = 'completed';
    } else if (paymentIntent.status === 'processing') {
      status = 'processing';
    } else if (
      paymentIntent.status === 'canceled' ||
      paymentIntent.status.includes('failed')
    ) {
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
      status,
      checkoutMode: (metadata?.checkoutMode ?? 'standard') as
        | 'standard'
        | 'adaptive'
        | 'free'
        | 'trial',
      expiresAt: session.expires_at,
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
      subscription: subscription
        ? {
            id: subscription.id,
            customerId: subscription.customer_id,
            productId: subscription.product_id,
            priceId: subscription.price_id,
            status: subscription.status,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          }
        : undefined,
    };
  }

  /**
   * Cancel an incomplete subscription and recreate it with (or without) discounts.
   * This ensures the first invoice has the correct discounted amount from the start.
   */
  private async recreateSubscriptionForDiscount(
    stripeSubscriptionId: string,
    stripeAccountId: string,
    originalSubParams: {
      customer: string;
      price: string;
      metadata: Record<string, string>;
      applicationFeePercent: number;
    },
    discounts: Stripe.SubscriptionCreateParams.Discount[] | undefined,
    paymentIntentDbId: string,
    subscriptionDbId: string,
    checkoutSessionId: string,
    newAmount: number,
    currency: string,
    supabase: ReturnType<SupabaseService['getClient']>,
  ): Promise<{ clientSecret: string }> {
    const stripeClient = this.stripeService.getClient();

    // 1. Cancel the current incomplete subscription
    await stripeClient.subscriptions.cancel(
      stripeSubscriptionId,
      {},
      { stripeAccount: stripeAccountId },
    );
    this.logger.log(
      `Canceled incomplete subscription ${stripeSubscriptionId} for discount recreation`,
    );

    // 2. Create new subscription with discounts included at creation time
    const createParams: Stripe.SubscriptionCreateParams = {
      customer: originalSubParams.customer,
      items: [{ price: originalSubParams.price }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      application_fee_percent: originalSubParams.applicationFeePercent,
      expand: ['latest_invoice'],
      metadata: {
        ...originalSubParams.metadata,
        subscriptionCreatedDuringCheckout: 'true',
      },
    };

    if (discounts && discounts.length > 0) {
      createParams.discounts = discounts;
    }

    const discountIdempotencyKey = `sub-recreate:${originalSubParams.customer}:${stripeSubscriptionId}:${Date.now()}`;
    const newSubscription = await this.stripeService.createSubscription(
      createParams,
      stripeAccountId,
      discountIdempotencyKey,
    );

    // 3. Retrieve invoice with expanded PaymentIntent
    const invoice = newSubscription.latest_invoice as Stripe.Invoice;
    const expandedInvoice = await stripeClient.invoices.retrieve(
      invoice.id,
      { expand: ['payments.data.payment.payment_intent'] },
      { stripeAccount: stripeAccountId },
    );

    const firstPayment = (expandedInvoice as any).payments?.data?.[0];
    const newPaymentIntent = firstPayment?.payment?.payment_intent as
      | Stripe.PaymentIntent
      | undefined;

    if (!newPaymentIntent?.client_secret) {
      this.logger.error(
        'No PaymentIntent found on recreated subscription invoice',
        {
          subscriptionId: newSubscription.id,
          invoiceId: invoice.id,
        },
      );
      throw new BadRequestException(
        'Failed to recreate subscription for discount',
      );
    }

    // 4. Update DB records BEFORE the webhook for the old subscription arrives
    const applicationFeeAmount = Math.round(newAmount * 0.05);
    const subData = newSubscription as any;

    // Update payment_intents row
    await supabase
      .from('payment_intents')
      .update({
        stripe_payment_intent_id: newPaymentIntent.id,
        client_secret: newPaymentIntent.client_secret,
        stripe_subscription_id: newSubscription.id,
        amount: newAmount,
        application_fee_amount: applicationFeeAmount,
        status: newPaymentIntent.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentIntentDbId);

    // Update subscriptions row
    await supabase
      .from('subscriptions')
      .update({
        stripe_subscription_id: newSubscription.id,
        amount: newAmount,
        status: newSubscription.status,
        current_period_start: subData.current_period_start
          ? new Date(subData.current_period_start * 1000).toISOString()
          : new Date().toISOString(),
        current_period_end: subData.current_period_end
          ? new Date(subData.current_period_end * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', subscriptionDbId);

    // Update checkout_sessions row (metadata is updated by the caller)
    await supabase
      .from('checkout_sessions')
      .update({
        stripe_subscription_id: newSubscription.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', checkoutSessionId);

    this.logger.log(
      `Recreated subscription: ${stripeSubscriptionId} → ${newSubscription.id} (amount: ${newAmount})`,
    );

    return { clientSecret: newPaymentIntent.client_secret };
  }

  async applyDiscount(
    sessionId: string,
    code: string,
  ): Promise<{
    discountAmount: number;
    totalAmount: number;
    discountLabel: string;
    clientSecret?: string;
  }> {
    // Acquire lock to prevent concurrent discount operations
    const lockKey = `discount-lock:${sessionId}`;
    const acquiredLock = await this.redisService.setIdempotencyKey(
      lockKey,
      Date.now().toString(),
      30000, // 30s TTL
    );

    if (!acquiredLock) {
      throw new ConflictException('Another discount operation is in progress');
    }

    try {
      return await this._applyDiscountInner(sessionId, code);
    } finally {
      await this.redisService.delete(lockKey);
    }
  }

  private async _applyDiscountInner(
    sessionId: string,
    code: string,
  ): Promise<{
    discountAmount: number;
    totalAmount: number;
    discountLabel: string;
    clientSecret?: string;
  }> {
    const supabase = this.supabaseService.getClient();

    const { data: session, error: sessionError } = await supabase
      .from('checkout_sessions')
      .select('*, payment_intent:payment_intents(*)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new NotFoundException('Checkout session not found');
    }

    if (session.completed_at) {
      throw new BadRequestException('Checkout session already completed');
    }

    const sessionMetadata = (session.metadata as any) || {};
    const paymentIntent = session.payment_intent as any;
    const isAdaptiveSession = sessionMetadata.checkoutMode === 'adaptive';
    const isTrialSession = sessionMetadata.checkoutMode === 'trial';

    if (!paymentIntent && !isAdaptiveSession && !isTrialSession) {
      throw new BadRequestException('Payment intent not found for session');
    }

    const organizationId = session.organization_id;
    const productId =
      isAdaptiveSession || isTrialSession
        ? sessionMetadata.productId
        : paymentIntent.product_id;
    const amount =
      isAdaptiveSession || isTrialSession
        ? (sessionMetadata.priceAmount as number)
        : (paymentIntent.amount as number);
    const stripeAccountId =
      isAdaptiveSession || isTrialSession
        ? (sessionMetadata.stripeAccountId as string)
        : (paymentIntent.stripe_account_id as string);
    const currency =
      isAdaptiveSession || isTrialSession
        ? ((sessionMetadata.priceCurrency as string) ?? 'usd')
        : ((paymentIntent?.currency as string) ?? 'usd');
    const stripeCheckoutSessionId = isAdaptiveSession
      ? (sessionMetadata.stripeCheckoutSessionId as string)
      : null;

    // Look up discount by code
    const { data: discount } = await supabase
      .from('discounts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('code', code)
      .is('deleted_at', null)
      .maybeSingle();

    if (!discount) {
      throw new BadRequestException('Invalid or expired code');
    }

    // Check product restrictions
    const { data: productRestrictions } = await supabase
      .from('discount_products')
      .select('product_id')
      .eq('discount_id', discount.id);

    if (productRestrictions && productRestrictions.length > 0) {
      const applicableProductIds = productRestrictions.map(
        (restriction: { product_id: string }) => restriction.product_id,
      );
      if (!applicableProductIds.includes(productId)) {
        throw new BadRequestException('Code not valid for this product');
      }
    }

    // Check redemption limits
    if (
      discount.max_redemptions &&
      discount.redemptions_count >= discount.max_redemptions
    ) {
      throw new BadRequestException('Code has reached its redemption limit');
    }

    // Calculate discount amount
    let discountAmount: number;
    let discountLabel: string;

    if (discount.type === 'percentage') {
      const basisPoints = discount.basis_points ?? 0;
      discountAmount = Math.round((amount * basisPoints) / 100);
      discountLabel = `${basisPoints}% off`;
    } else {
      const fixedAmount = discount.amount ?? 0;
      discountAmount = Math.min(fixedAmount, amount);
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: (discount.currency || 'usd').toUpperCase(),
      }).format(fixedAmount / 100);
      discountLabel = `-${formatted}`;
    }

    const newAmount = amount - discountAmount;
    // Build coupon params (shared by adaptive and standard paths)
    const buildCouponParams = (settlementCurrency: string) => {
      const discountDuration = discount.duration || 'once';
      return discount.type === 'percentage'
        ? {
            percent_off: discount.basis_points ?? 0,
            duration: discountDuration,
            ...(discountDuration === 'repeating' && discount.duration_in_months
              ? { duration_in_months: discount.duration_in_months }
              : {}),
          }
        : {
            amount_off: Math.min(discount.amount ?? 0, amount),
            currency: settlementCurrency,
            duration: discountDuration,
            ...(discountDuration === 'repeating' && discount.duration_in_months
              ? { duration_in_months: discount.duration_in_months }
              : {}),
          };
    };

    let stripeCouponId: string | null = null;
    let clientSecretResult: string | undefined;

    if (isTrialSession) {
      // Trial path: no Stripe object to update (SetupIntent has no amount).
      // Discount will be applied as coupon when subscription is created in the webhook.
      this.logger.log(
        `Trial session: discount ${code} recorded in metadata (coupon applied at subscription creation)`,
      );
    } else if (isAdaptiveSession) {
      // Adaptive path: create a Stripe coupon and apply to Checkout Session
      const settlementCurrency = sessionMetadata.priceCurrency ?? 'usd';
      const coupon = await this.stripeService
        .getClient()
        .coupons.create(buildCouponParams(settlementCurrency) as any, {
          stripeAccount: stripeAccountId,
        });
      stripeCouponId = coupon.id;

      await this.stripeService
        .getClient()
        .checkout.sessions.update(
          stripeCheckoutSessionId!,
          { discounts: [{ coupon: coupon.id }] } as any,
          { stripeAccount: stripeAccountId },
        );
    } else {
      // Standard path: cancel + recreate subscription with discount at creation time
      // This ensures the first invoice has the correct discounted amount.
      const stripeSubscriptionId =
        sessionMetadata.stripeSubscriptionId ||
        (session as any).stripe_subscription_id;

      if (stripeSubscriptionId) {
        const coupon = await this.stripeService
          .getClient()
          .coupons.create(buildCouponParams(currency) as any, {
            stripeAccount: stripeAccountId,
          });
        stripeCouponId = coupon.id;

        // Find the subscription DB record
        const { data: subscriptionRecord } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('payment_intent_id', paymentIntent.id)
          .single();

        if (!subscriptionRecord) {
          throw new BadRequestException('Subscription record not found');
        }

        // Retrieve original subscription to get customer and price info
        const originalSub = await this.stripeService
          .getClient()
          .subscriptions.retrieve(stripeSubscriptionId, {
            stripeAccount: stripeAccountId,
          });

        const result = await this.recreateSubscriptionForDiscount(
          stripeSubscriptionId,
          stripeAccountId,
          {
            customer: originalSub.customer as string,
            price: (originalSub.items.data[0]?.price as any).id,
            metadata: originalSub.metadata as Record<string, string>,
            applicationFeePercent: 5,
          },
          [{ coupon: coupon.id }],
          paymentIntent.id,
          subscriptionRecord.id,
          sessionId,
          newAmount,
          currency,
          supabase,
        );

        clientSecretResult = result.clientSecret;

        this.logger.log(
          `Applied discount via cancel+recreate: coupon ${coupon.id}, new amount ${newAmount}`,
        );
      } else {
        this.logger.error(
          'No subscription ID found for standard checkout discount',
        );
        throw new BadRequestException(
          'Unable to apply discount — subscription not found',
        );
      }
    }

    // Update checkout_sessions.metadata
    const existingMetadata = (session.metadata as any) || {};
    const newStripeSubscriptionId = clientSecretResult
      ? (
          await supabase
            .from('checkout_sessions')
            .select('stripe_subscription_id')
            .eq('id', sessionId)
            .single()
        ).data?.stripe_subscription_id
      : null;

    await supabase
      .from('checkout_sessions')
      .update({
        metadata: {
          ...existingMetadata,
          appliedDiscountId: discount.id,
          appliedDiscountCode: code,
          discountAmount,
          originalAmount: amount,
          stripeCouponId: stripeCouponId || discount.stripe_coupon_id || null,
          discountDuration: discount.duration || 'once',
          discountDurationInMonths: discount.duration_in_months || null,
          ...(newStripeSubscriptionId
            ? { stripeSubscriptionId: newStripeSubscriptionId }
            : {}),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    return {
      discountAmount,
      totalAmount: newAmount,
      discountLabel,
      clientSecret: clientSecretResult,
    };
  }

  async removeDiscount(
    sessionId: string,
  ): Promise<{ totalAmount: number; clientSecret?: string }> {
    // Acquire lock to prevent concurrent discount operations
    const lockKey = `discount-lock:${sessionId}`;
    const acquiredLock = await this.redisService.setIdempotencyKey(
      lockKey,
      Date.now().toString(),
      30000, // 30s TTL
    );

    if (!acquiredLock) {
      throw new ConflictException('Another discount operation is in progress');
    }

    try {
      return await this._removeDiscountInner(sessionId);
    } finally {
      await this.redisService.delete(lockKey);
    }
  }

  private async _removeDiscountInner(
    sessionId: string,
  ): Promise<{ totalAmount: number; clientSecret?: string }> {
    const supabase = this.supabaseService.getClient();

    const { data: session, error: sessionError } = await supabase
      .from('checkout_sessions')
      .select('*, payment_intent:payment_intents(*)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new NotFoundException('Checkout session not found');
    }

    const metadata = (session.metadata as any) || {};
    const paymentIntent = session.payment_intent as any;
    const isAdaptiveSession = metadata.checkoutMode === 'adaptive';
    const isTrialSession = metadata.checkoutMode === 'trial';

    // Idempotent — no discount applied
    if (!metadata.appliedDiscountId) {
      const fallbackAmount =
        isAdaptiveSession || isTrialSession
          ? (metadata.priceAmount ?? 0)
          : (paymentIntent?.amount ?? 0);
      return { totalAmount: fallbackAmount };
    }

    const originalAmount = metadata.originalAmount as number;
    let clientSecretResult: string | undefined;

    if (isTrialSession) {
      // Trial path: nothing to update on Stripe (just clear metadata below)
      this.logger.log('Trial session: removing discount from metadata only');
    } else if (isAdaptiveSession) {
      // Remove discount from Stripe Checkout Session
      const stripeCheckoutSessionId =
        metadata.stripeCheckoutSessionId as string;
      const stripeAccountId = metadata.stripeAccountId as string;
      await this.stripeService
        .getClient()
        .checkout.sessions.update(
          stripeCheckoutSessionId,
          { discounts: [] } as any,
          { stripeAccount: stripeAccountId },
        );
    } else {
      // Standard path: cancel + recreate subscription without discount
      const stripeSubscriptionId =
        metadata.stripeSubscriptionId ||
        (session as any).stripe_subscription_id;
      const stripeAccountId =
        (paymentIntent?.stripe_account_id as string) ||
        (metadata.stripeAccountId as string);

      if (stripeSubscriptionId && stripeAccountId) {
        // Find the subscription DB record
        const { data: subscriptionRecord } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('payment_intent_id', paymentIntent.id)
          .single();

        if (!subscriptionRecord) {
          throw new BadRequestException('Subscription record not found');
        }

        // Retrieve original subscription to get customer and price info
        const originalSub = await this.stripeService
          .getClient()
          .subscriptions.retrieve(stripeSubscriptionId, {
            stripeAccount: stripeAccountId,
          });

        const result = await this.recreateSubscriptionForDiscount(
          stripeSubscriptionId,
          stripeAccountId,
          {
            customer: originalSub.customer as string,
            price: (originalSub.items.data[0]?.price as any).id,
            metadata: originalSub.metadata as Record<string, string>,
            applicationFeePercent: 5,
          },
          undefined, // No discounts
          paymentIntent.id,
          subscriptionRecord.id,
          sessionId,
          originalAmount,
          paymentIntent.currency,
          supabase,
        );

        clientSecretResult = result.clientSecret;

        this.logger.log(
          `Removed discount via cancel+recreate: restored amount ${originalAmount}`,
        );
      }
    }

    // Clear discount keys from metadata
    const cleanMetadata = { ...metadata };
    delete cleanMetadata.appliedDiscountId;
    delete cleanMetadata.appliedDiscountCode;
    delete cleanMetadata.discountAmount;
    delete cleanMetadata.originalAmount;
    delete cleanMetadata.stripeCouponId;
    delete cleanMetadata.discountDuration;
    delete cleanMetadata.discountDurationInMonths;

    // Update stripeSubscriptionId in metadata if subscription was recreated
    if (clientSecretResult) {
      const { data: updatedSession } = await supabase
        .from('checkout_sessions')
        .select('stripe_subscription_id')
        .eq('id', sessionId)
        .single();
      if (updatedSession?.stripe_subscription_id) {
        cleanMetadata.stripeSubscriptionId =
          updatedSession.stripe_subscription_id;
      }
    }

    await supabase
      .from('checkout_sessions')
      .update({
        metadata: cleanMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    return { totalAmount: originalAmount, clientSecret: clientSecretResult };
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

  /**
   * Handle trial product checkout — uses SetupIntent (saves card, $0 upfront).
   * Subscription with trial_period_days is created in the setup_intent.succeeded webhook.
   */
  private async handleTrialCheckout(
    organizationId: string,
    externalUserId: string,
    product: any,
    price: any,
    stripeCustomerId: string,
    stripeAccountId: string,
    customerId: string,
    customerEmail?: string,
    customerName?: string,
    dto?: any,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();

    const amount = price.price_amount || 0;
    const currency = price.price_currency || 'usd';

    // Create metadata record (same as standard checkout)
    const checkoutMetadata = await this.metadataService.createMetadata({
      organizationId,
      customerId,
      productId: product.id,
      priceId: price.id,
      customerEmail: customerEmail || '',
      customerName: customerName || undefined,
      productName: product.name,
      priceAmount: amount,
      currency,
      billingInterval: price.recurring_interval as 'month' | 'year' | undefined,
      billingIntervalCount: price.recurring_interval_count || 1,
      trialPeriodDays: product.trial_days || undefined,
      shouldGrantTrial: true,
      featuresToGrant: [],
      successUrl:
        dto?.successUrl || `${process.env.APP_URL}/dashboard/billing/success`,
      cancelUrl:
        dto?.cancelUrl || `${process.env.APP_URL}/dashboard/billing/cancel`,
      metadata: {
        externalUserId,
        ...dto?.metadata,
      },
    });

    // Create SetupIntent — saves card without charging
    const setupIntent = await this.stripeService
      .getClient()
      .setupIntents.create(
        {
          customer: stripeCustomerId,
          usage: 'off_session',
          metadata: {
            metadataId: checkoutMetadata.id,
            organizationId,
            externalUserId,
            productId: product.id,
            priceId: price.id,
            trialDays: String(product.trial_days || 0),
            billingInterval: price.recurring_interval || 'month',
            billingIntervalCount: String(price.recurring_interval_count || 1),
            isTrialCheckout: 'true',
          },
        },
        { stripeAccount: stripeAccountId },
      );

    // Link metadata
    await this.metadataService.linkToCheckoutSession(
      checkoutMetadata.id,
      setupIntent.id,
    );

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Create checkout session record (no payment_intent_id — trial uses SetupIntent)
    const { data: checkoutSession, error: sessionError } = await supabase
      .from('checkout_sessions')
      .insert({
        organization_id: organizationId,
        session_token: externalUserId,
        payment_intent_id: null,
        customer_email: customerEmail,
        customer_name: customerName,
        customer_external_id: externalUserId,
        expires_at: expiresAt.toISOString(),
        metadata: {
          checkoutMode: 'trial',
          stripeSetupIntentId: setupIntent.id,
          clientSecret: setupIntent.client_secret,
          stripeAccountId,
          productId: product.id,
          priceId: price.id,
          customerId,
          priceAmount: amount,
          priceCurrency: currency,
          metadataId: checkoutMetadata.id,
          trialDays: product.trial_days,
          existingSubscriptionId: dto?.existingSubscriptionId,
          ...(dto?.metadata || {}),
        },
      })
      .select()
      .single();

    if (sessionError) {
      this.logger.error(
        'Failed to create trial checkout session:',
        sessionError,
      );
      throw new BadRequestException('Failed to create checkout session');
    }

    // Fetch product features
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    return {
      id: checkoutSession.id,
      clientSecret: setupIntent.client_secret!,
      paymentIntentId: '',
      amount: 0,
      currency,
      totalAmount: 0,
      checkoutMode: 'trial',
      product: {
        name: product.name,
        description: product.description,
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

  /**
   * Handle checkout with Stripe Adaptive Pricing (Checkout Session, embedded ui_mode)
   */
  private async handleAdaptiveCheckout(
    organizationId: string,
    externalUserId: string,
    product: any,
    price: any,
    stripeCustomerId: string,
    stripeAccountId: string,
    customerId: string,
    customerEmail?: string,
    customerName?: string,
    dto?: any,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();

    const amount = price.price_amount || 0;
    const currency = price.price_currency || 'usd';

    // Create metadata record
    const checkoutMetadata = await this.metadataService.createMetadata({
      organizationId,
      customerId,
      productId: product.id,
      priceId: price.id,
      customerEmail: customerEmail || '',
      customerName: customerName || undefined,
      productName: product.name,
      priceAmount: amount,
      currency,
      billingInterval: price.recurring_interval as 'month' | 'year' | undefined,
      billingIntervalCount: price.recurring_interval_count || 1,
      trialPeriodDays: product.trial_days || undefined,
      shouldGrantTrial: false,
      featuresToGrant: [],
      successUrl:
        dto?.successUrl || `${process.env.APP_URL}/embed/checkout/complete`,
      cancelUrl:
        dto?.cancelUrl || `${process.env.APP_URL}/embed/checkout/cancel`,
      metadata: {
        externalUserId,
        ...dto?.metadata,
      },
    });

    // Cancel orphaned Stripe subscriptions for this customer+price
    // These can exist if a previous checkout completed but the webhook was missed
    try {
      const existingStripeSubs = await this.stripeService
        .getClient()
        .subscriptions.list(
          {
            customer: stripeCustomerId,
            price: price.stripe_price_id,
            status: 'all',
            limit: 10,
          },
          { stripeAccount: stripeAccountId },
        );

      for (const sub of existingStripeSubs.data) {
        if (['canceled', 'ended'].includes(sub.status)) continue;

        const { data: dbSub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();

        if (!dbSub) {
          this.logger.warn(
            `Canceling orphaned Stripe subscription ${sub.id} (status: ${sub.status}) for customer ${stripeCustomerId}`,
          );
          await this.stripeService
            .getClient()
            .subscriptions.cancel(sub.id, { stripeAccount: stripeAccountId });
        }
      }
    } catch (cleanupError) {
      this.logger.warn(
        'Failed to clean up orphaned subscriptions:',
        cleanupError,
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Create Stripe Checkout Session in embedded mode with adaptive pricing
    const stripeSession = await this.stripeService
      .getClient()
      .checkout.sessions.create(
        {
          mode: 'subscription',
          currency,
          customer: stripeCustomerId,
          line_items: [{ price: price.stripe_price_id, quantity: 1 }],
          ui_mode: 'custom',
          adaptive_pricing: { enabled: true },
          subscription_data: {
            application_fee_percent: 5,
            ...(product.trial_days > 0
              ? { trial_period_days: product.trial_days }
              : {}),
            metadata: {
              metadataId: checkoutMetadata.id,
              organizationId,
              externalUserId,
              productId: product.id,
              priceId: price.id,
            },
          },
          metadata: {
            metadataId: checkoutMetadata.id,
            organizationId,
            externalUserId,
            productId: product.id,
            priceId: price.id,
          },
          return_url: `${process.env.APP_URL}/embed/checkout/complete`,
          expires_at: Math.floor(expiresAt.getTime() / 1000),
        } as any,
        { stripeAccount: stripeAccountId },
      );

    // Link metadata to this Stripe Checkout Session
    await this.metadataService.linkToCheckoutSession(
      checkoutMetadata.id,
      stripeSession.id,
    );

    // Create checkout_sessions record (no payment_intent_id for adaptive)
    const { data: checkoutSession, error: sessionError } = await supabase
      .from('checkout_sessions')
      .insert({
        organization_id: organizationId,
        session_token: externalUserId,
        payment_intent_id: null,
        customer_email: customerEmail,
        customer_name: customerName,
        customer_external_id: externalUserId,
        expires_at: expiresAt.toISOString(),
        metadata: {
          checkoutMode: 'adaptive',
          stripeCheckoutSessionId: stripeSession.id,
          clientSecret: stripeSession.client_secret,
          stripeAccountId,
          productId: product.id,
          priceId: price.id,
          customerId,
          priceAmount: amount,
          priceCurrency: currency,
          metadataId: checkoutMetadata.id,
          existingSubscriptionId: dto?.existingSubscriptionId,
          ...(dto?.metadata || {}),
        },
      })
      .select()
      .single();

    if (sessionError) {
      this.logger.error(
        'Failed to create adaptive checkout session:',
        sessionError,
      );
      throw new BadRequestException('Failed to create checkout session');
    }

    // Fetch product features for display
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    return {
      id: checkoutSession.id,
      clientSecret: stripeSession.client_secret!,
      paymentIntentId: '',
      amount,
      currency,
      totalAmount: amount,
      checkoutMode: 'adaptive',
      product: {
        name: product.name,
        description: product.description,
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

  /**
   * Return status for a trial checkout session (uses SetupIntent, no payment)
   */
  private async getTrialCheckoutStatus(
    session: any,
    metadata: any,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();
    const productId = metadata.productId;
    const priceId = metadata.priceId;

    const [{ data: product }, { data: price }] = await Promise.all([
      supabase.from('products').select('*').eq('id', productId).single(),
      supabase.from('product_prices').select('*').eq('id', priceId).single(),
    ]);

    if (!product || !price) {
      throw new NotFoundException(
        'Product or price not found for trial session',
      );
    }

    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    const isExpired =
      new Date(session.expires_at) < new Date() && !session.completed_at;

    let subscription: any = null;
    if (session.subscription_id) {
      const { data: subscriptionData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', session.subscription_id)
        .single();
      subscription = subscriptionData;
    }

    const status:
      | 'pending'
      | 'processing'
      | 'completed'
      | 'failed'
      | 'expired' = isExpired
      ? 'expired'
      : session.completed_at
        ? 'completed'
        : 'pending';

    return {
      id: session.id,
      clientSecret: metadata.clientSecret || '',
      paymentIntentId: '',
      amount: 0,
      currency: metadata.priceCurrency || price.price_currency || 'usd',
      totalAmount: 0,
      status,
      checkoutMode: 'trial',
      expiresAt: session.expires_at,
      product: {
        name: product.name,
        description: product.description || undefined,
        interval: price.recurring_interval || 'month',
        intervalCount: price.recurring_interval_count || 1,
        features,
      },
      customer: {
        email: session.customer_email || undefined,
        name: session.customer_name || undefined,
      },
      stripeAccountId: metadata.stripeAccountId || undefined,
      trialDays: product.trial_days || 0,
      subscription: subscription
        ? {
            id: subscription.id,
            customerId: subscription.customer_id,
            productId: subscription.product_id,
            priceId: subscription.price_id || '',
            status: subscription.status,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          }
        : undefined,
    };
  }

  /**
   * Return status for an adaptive checkout session (no payment_intent record)
   */
  private async getAdaptiveCheckoutStatus(
    session: any,
    metadata: any,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();

    const productId = metadata.productId;
    const priceId = metadata.priceId;

    // Fetch product and price details
    const [{ data: product }, { data: price }] = await Promise.all([
      supabase.from('products').select('*').eq('id', productId).single(),
      supabase.from('product_prices').select('*').eq('id', priceId).single(),
    ]);

    if (!product || !price) {
      throw new NotFoundException(
        'Product or price not found for adaptive session',
      );
    }

    // Fetch product features
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    const isExpired =
      new Date(session.expires_at) < new Date() && !session.completed_at;

    // Check if subscription has been created (via webhook)
    let subscription: any = null;
    if (session.subscription_id) {
      const { data: subscriptionData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', session.subscription_id)
        .single();
      subscription = subscriptionData;
    }

    const status:
      | 'pending'
      | 'processing'
      | 'completed'
      | 'failed'
      | 'expired' = isExpired
      ? 'expired'
      : session.completed_at
        ? 'completed'
        : 'pending';

    return {
      id: session.id,
      clientSecret: metadata.clientSecret || '',
      paymentIntentId: '',
      amount: metadata.priceAmount || price.price_amount || 0,
      currency: metadata.priceCurrency || price.price_currency || 'usd',
      totalAmount: metadata.priceAmount || price.price_amount || 0,
      status,
      checkoutMode: 'adaptive',
      expiresAt: session.expires_at,
      product: {
        name: product.name,
        description: product.description || undefined,
        interval: price.recurring_interval || 'month',
        intervalCount: price.recurring_interval_count || 1,
        features,
      },
      customer: {
        email: session.customer_email || undefined,
        name: session.customer_name || undefined,
      },
      stripeAccountId: metadata.stripeAccountId || undefined,
      trialDays: product.trial_days || 0,
      subscription: subscription
        ? {
            id: subscription.id,
            customerId: subscription.customer_id,
            productId: subscription.product_id,
            priceId: subscription.price_id || '',
            status: subscription.status,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          }
        : undefined,
    };
  }

  /**
   * Handle checkout for free products - no payment required
   */
  private async handleFreeCheckout(
    organizationId: string,
    externalUserId: string,
    product: any,
    price: any,
    stripeCustomerId: string,
    customerId: string,
    customerEmail?: string,
    customerName?: string,
    metadata?: any,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();

    // Create a "free" checkout session record (NO subscription yet - wait for user confirmation)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const { data: checkoutSession, error: sessionError } = await supabase
      .from('checkout_sessions')
      .insert({
        organization_id: organizationId,
        session_token: externalUserId,
        payment_intent_id: null, // No payment intent for free products
        customer_email: customerEmail,
        customer_name: customerName,
        customer_external_id: externalUserId,
        expires_at: expiresAt.toISOString(),
        completed_at: null, // Will be set when user confirms
        metadata: {
          ...metadata,
          isFreeProduct: true,
          customerId, // Store for later confirmation
          productId: product.id,
          priceId: price.id,
        },
      })
      .select()
      .single();

    if (sessionError) {
      this.logger.error(
        'Failed to create free checkout session:',
        sessionError,
      );
      throw new BadRequestException('Failed to create checkout session');
    }

    // Fetch product features for display
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    const features = (productFeatures || []).map(
      (pf: any) => pf.features.title,
    );

    // Return checkout session WITHOUT subscription (subscription will be created on confirmation)
    return {
      id: checkoutSession.id,
      clientSecret: '', // No client secret for free products
      paymentIntentId: '', // No payment intent for free products
      amount: 0,
      currency: price.price_currency || 'usd',
      totalAmount: 0,
      product: {
        name: product.name,
        description: product.description,
        interval: price.recurring_interval || 'month',
        intervalCount: price.recurring_interval_count || 1,
        features,
      },
      customer: {
        email: customerEmail,
        name: customerName,
      },
      stripeAccountId: undefined, // No Stripe account needed for free
      trialDays: 0, // No trial for free products
      // NO subscription field - will be created on confirmation
    };
  }

  /**
   * Confirm and activate a free product checkout by creating the subscription
   * Called when user clicks "Get Started for Free" button
   */
  async confirmFreeCheckout(sessionId: string): Promise<any> {
    const supabase = this.supabaseService.getClient();

    // 1. Fetch the checkout session
    const { data: checkoutSession, error: sessionError } = await supabase
      .from('checkout_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !checkoutSession) {
      this.logger.error('Checkout session not found:', sessionError);
      throw new NotFoundException('Checkout session not found');
    }

    // 2. Validate it's a free product session
    const sessionMetadata = checkoutSession.metadata as any;
    if (!sessionMetadata?.isFreeProduct) {
      throw new BadRequestException(
        'This endpoint is only for free product confirmations',
      );
    }

    // 3. Check if already confirmed/completed
    if (checkoutSession.completed_at) {
      // Already completed - return existing subscription
      if ((checkoutSession as any).subscription_id) {
        const { data: existingSubscription } = await supabase
          .from('subscriptions')
          .select('*, product:products(*), price:product_prices(*)')
          .eq('id', (checkoutSession as any).subscription_id)
          .single();

        if (existingSubscription) {
          this.logger.log(
            `Checkout session already completed, returning existing subscription: ${existingSubscription.id}`,
          );
          return existingSubscription;
        }
      }
    }

    // 4. Extract metadata
    const customerId = sessionMetadata.customerId;
    const productId = sessionMetadata.productId;
    const priceId = sessionMetadata.priceId;
    const organizationId = checkoutSession.organization_id;
    const metadata = sessionMetadata;

    if (!customerId || !productId || !priceId) {
      throw new BadRequestException(
        'Missing required data in checkout session',
      );
    }

    // 5. Fetch product and price details
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    const { data: price } = await supabase
      .from('product_prices')
      .select('*')
      .eq('id', priceId)
      .single();

    if (!product || !price) {
      throw new NotFoundException('Product or price not found');
    }

    // 6. Check for existing subscription (idempotency + reactivation logic)
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let subscription: any;

    if (existingSubscription) {
      // Subscription exists - check status
      if (
        existingSubscription.status === 'active' ||
        existingSubscription.status === 'trialing'
      ) {
        // Already has active subscription - return it
        this.logger.log(
          `Customer already has active subscription: ${existingSubscription.id}`,
        );
        subscription = existingSubscription;
      } else if (
        existingSubscription.status === 'canceled' ||
        existingSubscription.status === 'ended'
      ) {
        // Reactivate cancelled/ended subscription
        this.logger.log(
          `Reactivating subscription: ${existingSubscription.id}`,
        );

        const { data: reactivated, error: reactivateError } = await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: this.calculatePeriodEnd(
              new Date(),
              price.recurring_interval,
              price.recurring_interval_count || 1,
            ),
            cancel_at_period_end: false,
            canceled_at: null,
            ended_at: null,
            updated_at: new Date().toISOString(),
            metadata: {
              ...((existingSubscription.metadata as any) || {}),
              isFreeProduct: true,
              reactivatedAt: new Date().toISOString(),
              checkoutSessionId: checkoutSession.id,
            },
          })
          .eq('id', existingSubscription.id)
          .select('*, product:products(*), price:product_prices(*)')
          .single();

        if (reactivateError) {
          this.logger.error(
            'Failed to reactivate subscription:',
            reactivateError,
          );
          throw new BadRequestException('Failed to reactivate subscription');
        }

        subscription = reactivated;
      } else {
        // Other status - create new (shouldn't happen often)
        throw new BadRequestException(
          `Cannot subscribe: existing subscription in ${existingSubscription.status} status`,
        );
      }
    } else {
      // No existing subscription - create new
      const { data: newSubscription, error: subscriptionError } = await supabase
        .from('subscriptions')
        .insert({
          organization_id: organizationId,
          customer_id: customerId,
          product_id: productId,
          price_id: priceId,
          stripe_subscription_id: null, // No Stripe subscription for free products
          status: 'active',
          amount: 0, // Free product
          currency: price.price_currency || 'usd',
          current_period_start: new Date().toISOString(),
          current_period_end: this.calculatePeriodEnd(
            new Date(),
            price.recurring_interval,
            price.recurring_interval_count || 1,
          ),
          trial_start: null, // No trial for free products
          trial_end: null,
          cancel_at_period_end: false,
          canceled_at: null,
          ended_at: null,
          metadata: {
            ...metadata,
            isFreeProduct: true,
            checkoutSessionId: checkoutSession.id,
          },
        })
        .select('*, product:products(*), price:product_prices(*)')
        .single();

      if (subscriptionError) {
        this.logger.error(
          'Failed to create free subscription:',
          subscriptionError,
        );
        throw new BadRequestException('Failed to create subscription');
      }

      subscription = newSubscription;
    }

    // 7. Update checkout session as completed
    await supabase
      .from('checkout_sessions')
      .update({
        subscription_id: subscription.id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', checkoutSession.id);

    this.logger.log(
      `Free checkout confirmed, subscription created/reactivated: ${subscription.id}`,
    );

    return subscription;
  }

  /**
   * Calculate the end date for a subscription period
   */
  private calculatePeriodEnd(
    startDate: Date,
    interval: string,
    intervalCount: number,
  ): string {
    const endDate = new Date(startDate);

    switch (interval) {
      case 'day':
        endDate.setDate(endDate.getDate() + intervalCount);
        break;
      case 'week':
        endDate.setDate(endDate.getDate() + 7 * intervalCount);
        break;
      case 'month':
        endDate.setMonth(endDate.getMonth() + intervalCount);
        break;
      case 'year':
        endDate.setFullYear(endDate.getFullYear() + intervalCount);
        break;
      default:
        // Default to monthly
        endDate.setMonth(endDate.getMonth() + 1);
    }

    return endDate.toISOString();
  }
}
