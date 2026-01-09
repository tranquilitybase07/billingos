import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (!secretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is not defined in environment variables',
      );
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-12-15.clover',
      typescript: true,
    });

    this.logger.log('Stripe SDK initialized');
  }

  /**
   * Get the Stripe client instance
   */
  getClient(): Stripe {
    return this.stripe;
  }

  /**
   * Create a Stripe Connect account
   */
  async createConnectAccount(params: {
    email: string;
    country: string;
    businessType?: Stripe.AccountCreateParams.BusinessType;
  }): Promise<Stripe.Account> {
    this.logger.log(`Creating Stripe Connect account for ${params.email}`);

    const account = await this.stripe.accounts.create({
      type: 'express', // Express account for easier onboarding
      email: params.email,
      country: params.country,
      business_type: params.businessType || 'individual',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    this.logger.log(`Created Stripe Connect account: ${account.id}`);
    return account;
  }

  /**
   * Get Stripe Connect account details
   */
  async getConnectAccount(accountId: string): Promise<Stripe.Account> {
    return await this.stripe.accounts.retrieve(accountId);
  }

  /**
   * Update Stripe Connect account
   */
  async updateConnectAccount(
    accountId: string,
    params: Stripe.AccountUpdateParams,
  ): Promise<Stripe.Account> {
    this.logger.log(`Updating Stripe Connect account: ${accountId}`);
    return await this.stripe.accounts.update(accountId, params);
  }

  /**
   * Delete Stripe Connect account
   */
  async deleteConnectAccount(
    accountId: string,
  ): Promise<Stripe.DeletedAccount> {
    this.logger.log(`Deleting Stripe Connect account: ${accountId}`);
    return await this.stripe.accounts.del(accountId);
  }

  /**
   * Create an Account Link for Stripe Connect onboarding
   */
  async createAccountLink(params: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
    type?: Stripe.AccountLinkCreateParams.Type;
  }): Promise<Stripe.AccountLink> {
    this.logger.log(`Creating account link for ${params.accountId}`);

    return await this.stripe.accountLinks.create({
      account: params.accountId,
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
      type: params.type || 'account_onboarding',
    });
  }

  /**
   * Create a Login Link for Stripe Express Dashboard
   */
  async createDashboardLoginLink(accountId: string): Promise<Stripe.LoginLink> {
    this.logger.log(`Creating dashboard login link for ${accountId}`);

    return await this.stripe.accounts.createLoginLink(accountId);
  }

  /**
   * Create Stripe Identity Verification Session
   */
  async createIdentityVerificationSession(params: {
    type: 'document' | 'id_number';
    metadata?: Stripe.MetadataParam;
  }): Promise<Stripe.Identity.VerificationSession> {
    this.logger.log('Creating identity verification session');

    return await this.stripe.identity.verificationSessions.create({
      type: params.type,
      metadata: params.metadata,
    });
  }

  /**
   * Retrieve Identity Verification Session
   */
  async getIdentityVerificationSession(
    sessionId: string,
  ): Promise<Stripe.Identity.VerificationSession> {
    return await this.stripe.identity.verificationSessions.retrieve(sessionId);
  }

  /**
   * Construct webhook event from raw body and signature
   */
  constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
  ): Stripe.Event {
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not defined');
    }

    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }

  /**
   * Create a customer (for when users make purchases, not Connect)
   */
  async createCustomer(params: {
    email: string;
    name?: string;
    metadata?: Stripe.MetadataParam;
  }): Promise<Stripe.Customer> {
    this.logger.log(`Creating Stripe customer for ${params.email}`);

    return await this.stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: params.metadata,
    });
  }

  /**
   * Get customer by ID
   */
  async getCustomer(
    customerId: string,
  ): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    return await this.stripe.customers.retrieve(customerId);
  }

  /**
   * Update customer
   */
  async updateCustomer(
    customerId: string,
    params: Stripe.CustomerUpdateParams,
  ): Promise<Stripe.Customer> {
    return await this.stripe.customers.update(customerId, params);
  }

  /**
   * Create a product in Stripe Connect account
   */
  async createProduct(
    params: Stripe.ProductCreateParams,
    stripeAccountId: string,
  ): Promise<Stripe.Product> {
    this.logger.log(
      `Creating Stripe product: ${params.name} for account ${stripeAccountId}`,
    );

    return await this.stripe.products.create(params, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * Update a product in Stripe Connect account
   */
  async updateProduct(
    productId: string,
    params: Stripe.ProductUpdateParams,
    stripeAccountId: string,
  ): Promise<Stripe.Product> {
    this.logger.log(
      `Updating Stripe product: ${productId} for account ${stripeAccountId}`,
    );

    return await this.stripe.products.update(productId, params, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * Delete a product in Stripe Connect account
   */
  async deleteProduct(
    productId: string,
    stripeAccountId: string,
  ): Promise<Stripe.DeletedProduct> {
    this.logger.log(
      `Deleting Stripe product: ${productId} for account ${stripeAccountId}`,
    );

    return await this.stripe.products.del(productId, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * Create a price in Stripe Connect account
   */
  async createPrice(
    params: Stripe.PriceCreateParams,
    stripeAccountId: string,
  ): Promise<Stripe.Price> {
    this.logger.log(
      `Creating Stripe price for product ${params.product} in account ${stripeAccountId}`,
    );

    return await this.stripe.prices.create(params, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * Get price from Stripe Connect account
   */
  async getPrice(
    priceId: string,
    stripeAccountId: string,
  ): Promise<Stripe.Price> {
    return await this.stripe.prices.retrieve(priceId, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * Create a subscription in Stripe Connect account
   */
  async createSubscription(
    params: Stripe.SubscriptionCreateParams,
    stripeAccountId: string,
  ): Promise<Stripe.Subscription> {
    this.logger.log(
      `Creating Stripe subscription for customer ${params.customer} in account ${stripeAccountId}`,
    );

    return await this.stripe.subscriptions.create(params, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * Get subscription from Stripe Connect account
   */
  async getSubscription(
    subscriptionId: string,
    stripeAccountId: string,
  ): Promise<Stripe.Subscription> {
    return await this.stripe.subscriptions.retrieve(subscriptionId, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * Cancel a subscription in Stripe Connect account
   */
  async cancelSubscription(
    subscriptionId: string,
    stripeAccountId: string,
    cancelAtPeriodEnd: boolean = true,
  ): Promise<Stripe.Subscription> {
    this.logger.log(
      `Canceling Stripe subscription: ${subscriptionId} in account ${stripeAccountId}`,
    );

    if (cancelAtPeriodEnd) {
      return await this.stripe.subscriptions.update(
        subscriptionId,
        {
          cancel_at_period_end: true,
        },
        {
          stripeAccount: stripeAccountId,
        },
      );
    } else {
      return await this.stripe.subscriptions.cancel(
        subscriptionId,
        {},
        {
          stripeAccount: stripeAccountId,
        },
      );
    }
  }

  /**
   * Update a subscription in Stripe Connect account
   */
  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
    stripeAccountId: string,
  ): Promise<Stripe.Subscription> {
    this.logger.log(
      `Updating Stripe subscription: ${subscriptionId} in account ${stripeAccountId}`,
    );

    return await this.stripe.subscriptions.update(subscriptionId, params, {
      stripeAccount: stripeAccountId,
    });
  }
}
