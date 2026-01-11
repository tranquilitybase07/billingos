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

  // ================================================
  // STRIPE ENTITLEMENTS API METHODS
  // ================================================

  /**
   * Create an Entitlements Feature in Stripe
   * https://docs.stripe.com/api/entitlements/feature/create
   */
  async createEntitlementFeature(params: {
    name: string;
    lookupKey: string;
    metadata?: Stripe.MetadataParam;
    stripeAccountId: string;
  }): Promise<Stripe.Entitlements.Feature> {
    this.logger.log(
      `Creating Stripe Entitlement Feature: ${params.name} with lookup_key: ${params.lookupKey}`,
    );

    return await this.stripe.entitlements.features.create(
      {
        name: params.name,
        lookup_key: params.lookupKey,
        metadata: params.metadata,
      },
      {
        stripeAccount: params.stripeAccountId,
      },
    );
  }

  /**
   * Retrieve an Entitlements Feature from Stripe
   * https://docs.stripe.com/api/entitlements/feature/retrieve
   */
  async getEntitlementFeature(
    featureId: string,
    stripeAccountId: string,
  ): Promise<Stripe.Entitlements.Feature> {
    return await this.stripe.entitlements.features.retrieve(featureId, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * List all Entitlements Features in Stripe Connect account
   * https://docs.stripe.com/api/entitlements/feature/list
   */
  async listEntitlementFeatures(
    stripeAccountId: string,
    limit: number = 100,
  ): Promise<Stripe.ApiList<Stripe.Entitlements.Feature>> {
    return await this.stripe.entitlements.features.list(
      { limit },
      {
        stripeAccount: stripeAccountId,
      },
    );
  }

  /**
   * Update an Entitlements Feature in Stripe
   * https://docs.stripe.com/api/entitlements/feature/update
   */
  async updateEntitlementFeature(
    featureId: string,
    params: {
      name?: string;
      metadata?: Stripe.MetadataParam;
      stripeAccountId: string;
    },
  ): Promise<Stripe.Entitlements.Feature> {
    this.logger.log(`Updating Stripe Entitlement Feature: ${featureId}`);

    const updateParams: Stripe.Entitlements.FeatureUpdateParams = {};
    if (params.name) updateParams.name = params.name;
    if (params.metadata) updateParams.metadata = params.metadata;

    return await this.stripe.entitlements.features.update(
      featureId,
      updateParams,
      {
        stripeAccount: params.stripeAccountId,
      },
    );
  }

  /**
   * Archive an Entitlements Feature in Stripe (soft delete)
   * Features cannot be deleted, only archived
   * https://docs.stripe.com/api/entitlements/feature/update
   */
  async archiveEntitlementFeature(
    featureId: string,
    stripeAccountId: string,
  ): Promise<Stripe.Entitlements.Feature> {
    this.logger.log(`Archiving Stripe Entitlement Feature: ${featureId}`);

    return await this.stripe.entitlements.features.update(
      featureId,
      {
        active: false,
      },
      {
        stripeAccount: stripeAccountId,
      },
    );
  }

  /**
   * Attach a Feature to a Stripe Product
   * This creates the link between a product and its features
   * Note: We use product metadata to track linked features since
   * Stripe doesn't have a direct product-feature association in the API
   * https://docs.stripe.com/api/products/update
   */
  /**
   * Attach a Feature to a Stripe Product using the Product Features API
   * This creates a proper product_feature link that Stripe uses to generate Active Entitlements
   * https://docs.stripe.com/api/product-feature/attach
   */
  async attachFeatureToProduct(params: {
    productId: string;
    featureId: string;
    stripeAccountId: string;
  }): Promise<Stripe.ProductFeature> {
    this.logger.log(
      `Attaching Feature ${params.featureId} to Product ${params.productId} via Product Features API`,
    );

    // Use the correct API endpoint: POST /v1/products/{id}/features
    return await this.stripe.products.createFeature(
      params.productId,
      {
        entitlement_feature: params.featureId,
      },
      {
        stripeAccount: params.stripeAccountId,
      },
    );
  }

  /**
   * List all features attached to a product
   * https://docs.stripe.com/api/product-feature/list
   */
  async listProductFeatures(
    productId: string,
    stripeAccountId: string,
  ): Promise<Stripe.ApiList<Stripe.ProductFeature>> {
    this.logger.log(`Listing features for product: ${productId}`);

    return await this.stripe.products.listFeatures(
      productId,
      {},
      {
        stripeAccount: stripeAccountId,
      },
    );
  }

  /**
   * Detach a feature from a product
   * https://docs.stripe.com/api/product-feature/detach
   */
  async detachFeatureFromProduct(
    productId: string,
    productFeatureId: string,
    stripeAccountId: string,
  ): Promise<Stripe.DeletedProductFeature> {
    this.logger.log(
      `Detaching ProductFeature ${productFeatureId} from Product ${productId}`,
    );

    return await this.stripe.products.deleteFeature(
      productId,
      productFeatureId,
      {
        stripeAccount: stripeAccountId,
      },
    );
  }

  /**
   * List Active Entitlements for a customer
   * Shows what features a customer currently has access to
   * https://docs.stripe.com/api/entitlements/active_entitlement/list
   */
  async listActiveEntitlements(params: {
    customerId: string;
    stripeAccountId: string;
    limit?: number;
  }): Promise<Stripe.ApiList<Stripe.Entitlements.ActiveEntitlement>> {
    this.logger.log(
      `Listing Active Entitlements for customer: ${params.customerId}`,
    );

    return await this.stripe.entitlements.activeEntitlements.list(
      {
        customer: params.customerId,
        limit: params.limit || 100,
      },
      {
        stripeAccount: params.stripeAccountId,
      },
    );
  }

  /**
   * Get a specific Active Entitlement
   * https://docs.stripe.com/api/entitlements/active_entitlement/retrieve
   */
  async getActiveEntitlement(
    entitlementId: string,
    stripeAccountId: string,
  ): Promise<Stripe.Entitlements.ActiveEntitlement> {
    return await this.stripe.entitlements.activeEntitlements.retrieve(
      entitlementId,
      {
        stripeAccount: stripeAccountId,
      },
    );
  }

  /**
   * Check if a customer has access to a specific feature
   * This is a convenience method that lists active entitlements and checks for the feature
   */
  async hasFeatureAccess(params: {
    customerId: string;
    featureLookupKey: string;
    stripeAccountId: string;
  }): Promise<boolean> {
    try {
      const entitlements = await this.listActiveEntitlements({
        customerId: params.customerId,
        stripeAccountId: params.stripeAccountId,
        limit: 100,
      });

      return entitlements.data.some(
        (entitlement) =>
          entitlement.feature &&
          typeof entitlement.feature !== 'string' &&
          entitlement.feature.lookup_key === params.featureLookupKey,
      );
    } catch (error) {
      this.logger.error(
        `Error checking feature access for customer ${params.customerId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Sync Active Entitlements from a Subscription
   * After creating/updating a subscription, this fetches the resulting active entitlements
   * Stripe automatically creates active entitlements based on the product's features
   */
  async syncActiveEntitlementsFromSubscription(params: {
    subscriptionId: string;
    customerId: string;
    stripeAccountId: string;
  }): Promise<Stripe.Entitlements.ActiveEntitlement[]> {
    this.logger.log(
      `Syncing Active Entitlements from subscription: ${params.subscriptionId}`,
    );

    // Retrieve the subscription to ensure it's active
    const subscription = await this.getSubscription(
      params.subscriptionId,
      params.stripeAccountId,
    );

    if (!['active', 'trialing'].includes(subscription.status)) {
      this.logger.warn(
        `Subscription ${params.subscriptionId} is not active (status: ${subscription.status})`,
      );
      return [];
    }

    // List all active entitlements for the customer
    const entitlements = await this.listActiveEntitlements({
      customerId: params.customerId,
      stripeAccountId: params.stripeAccountId,
    });

    return entitlements.data;
  }
}
