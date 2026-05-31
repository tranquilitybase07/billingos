import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { getCurrencyForCountry } from '../common/constants/currencies';

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
   * Check if running with test keys (sandbox)
   */
  isTestMode(): boolean {
    const key = this.configService.get<string>('STRIPE_SECRET_KEY');
    return key?.startsWith('sk_test_') ?? false;
  }

  /**
   * Check if the backend is running in sandbox environment
   */
  isSandboxEnvironment(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'sandbox';
  }

  /**
   * Create and auto-verify a Stripe Custom account using Stripe's test magic values.
   * ONLY works in sandbox mode with test keys — throws otherwise.
   *
   * Uses a platform-controlled account (`controller.requirement_collection:
   * 'application'`) rather than Express. This is the only account type where the
   * platform may accept ToS on behalf of the merchant and submit identity +
   * external_account programmatically — Stripe forbids that for Express/Standard
   * (`controller[requirement_collection]=stripe`). This is what makes the
   * magic-value bypass legal and delivers instant, chargeable sandbox accounts
   * with no hosted onboarding. Production keeps using Express via
   * createConnectAccount.
   */
  async createTestAccountWithBypass(params: {
    email: string;
    country?: string;
    organizationName?: string;
  }): Promise<Stripe.Account> {
    if (!this.isTestMode() || !this.isSandboxEnvironment()) {
      throw new Error(
        'Auto-verification only available in sandbox mode with test keys',
      );
    }

    const country = params.country || 'US';

    // Step 1: Create a platform-controlled (Custom-equivalent) account
    const account = await this.stripe.accounts.create({
      email: params.email,
      country,
      business_type: 'individual',
      controller: {
        fees: { payer: 'application' },
        losses: { payments: 'application' },
        stripe_dashboard: { type: 'none' },
        requirement_collection: 'application',
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        auto_created: 'true',
        organization_name: params.organizationName || '',
        environment: 'sandbox',
      },
    });

    // Step 2: Auto-verify with Stripe's magic test values.
    // Split into three updates so a failure in the brittle identity step
    // doesn't take down the business_profile that Checkout requires.

    // 2a. Business profile + settings + TOS — MUST succeed.
    // Checkout fails with "must set an account or business name" if business_profile.name is missing,
    // so we let this throw rather than swallow.
    await this.stripe.accounts.update(account.id, {
      business_profile: {
        mcc: '5734',
        name: params.organizationName || 'Test Business',
        // Stripe rejects reserved placeholder domains like example.com with
        // "not a valid url"; use a real, resolvable domain for sandbox accounts.
        url: 'https://billingos.dev',
      },
      settings: {
        payments: {
          statement_descriptor: (params.organizationName || 'TEST BUSINESS')
            .replace(/[^A-Z0-9 ]/gi, '')
            .toUpperCase()
            .substring(0, 22)
            .padEnd(5, 'X'), // Must be 5-22 chars, letters/numbers/spaces only
        },
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: '127.0.0.1',
        user_agent: 'BillingOS Sandbox Auto-Creation',
      },
    });

    // 2b. Identity (DOB/SSN/address magic values) — best-effort.
    // If this fails, KYC stays pending but the account can still take payments
    // in test mode, so we warn rather than throw.
    try {
      await this.stripe.accounts.update(account.id, {
        individual: {
          first_name: 'Test',
          last_name: 'Merchant',
          email: params.email,
          phone: '+16505551234',
          dob: { day: 1, month: 1, year: 1901 }, // Stripe magic DOB for instant verification
          address: {
            line1: 'address_full_match', // Stripe magic address value
            city: 'San Francisco',
            state: 'CA',
            postal_code: '94102',
            country,
          },
          ssn_last_4: '0000',
        } as Stripe.AccountUpdateParams.Individual,
      });
    } catch (error) {
      this.logger.warn(
        `[Sandbox] Identity update failed for ${account.id}: ${(error as Error).message}`,
      );
    }

    // 2c. External bank account (separate call to isolate validation failures)
    try {
      await this.stripe.accounts.update(account.id, {
        external_account: {
          object: 'bank_account',
          country,
          currency: getCurrencyForCountry(country),
          account_holder_name: 'Test Merchant',
          account_holder_type: 'individual',
          routing_number: '110000000', // Stripe test routing number
          account_number: '000123456789', // Stripe test account number
        } as any,
      });
    } catch (error) {
      this.logger.warn(
        `[Sandbox] External account update failed for ${account.id}: ${(error as Error).message}`,
      );
    }

    return await this.stripe.accounts.retrieve(account.id);
  }

  /**
   * Smart account creation: auto-verifies in sandbox, uses normal flow in production
   */
  async createConnectAccountSmart(params: {
    email: string;
    country: string;
    businessType?: Stripe.AccountCreateParams.BusinessType;
    organizationName?: string;
  }): Promise<{ account: Stripe.Account; autoCreated: boolean }> {
    if (this.isSandboxEnvironment() && this.isTestMode()) {
      const account = await this.createTestAccountWithBypass({
        email: params.email,
        country: params.country,
        organizationName: params.organizationName,
      });
      return { account, autoCreated: true };
    }

    const account = await this.createConnectAccount({
      email: params.email,
      country: params.country,
      businessType: params.businessType,
    });
    return { account, autoCreated: false };
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
   * Build the Stripe Connect OAuth authorization URL (read_write scope).
   */
  getOAuthAuthorizeUrl(params: {
    clientId: string;
    state: string;
    redirectUri: string;
  }): string {
    const url = new URL('https://connect.stripe.com/oauth/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('scope', 'read_write');
    url.searchParams.set('state', params.state);
    url.searchParams.set('redirect_uri', params.redirectUri);
    return url.toString();
  }

  /**
   * Exchange an OAuth authorization code for the connected Stripe account ID.
   */
  async exchangeOAuthCode(code: string): Promise<{
    stripeUserId: string;
    scope: string;
  }> {
    const response = await this.stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    });

    if (!response.stripe_user_id) {
      throw new Error('Stripe OAuth response missing stripe_user_id');
    }

    return {
      stripeUserId: response.stripe_user_id,
      scope: response.scope ?? 'read_write',
    };
  }

  /**
   * Revoke the platform's OAuth access to a connected Standard account.
   */
  async deauthorizeOAuthAccount(stripeAccountId: string): Promise<void> {
    const clientId = this.configService.get<string>('STRIPE_CLIENT_ID');
    if (!clientId) {
      throw new Error('STRIPE_CLIENT_ID is not configured');
    }
    this.logger.log(`Deauthorizing OAuth account ${stripeAccountId}`);
    await this.stripe.oauth.deauthorize({
      client_id: clientId,
      stripe_user_id: stripeAccountId,
    });
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
    stripeAccountId?: string,
  ): Promise<Stripe.Customer> {
    const options: Stripe.RequestOptions = {};
    if (stripeAccountId) {
      options.stripeAccount = stripeAccountId;
    }
    return await this.stripe.customers.update(customerId, params, options);
  }

  /**
   * Attach a payment method to a customer
   */
  async attachPaymentMethodToCustomer(
    paymentMethodId: string,
    customerId: string,
    stripeAccountId?: string,
  ): Promise<Stripe.PaymentMethod> {
    this.logger.log(
      `Attaching payment method ${paymentMethodId} to customer ${customerId}`,
    );

    const options: Stripe.RequestOptions = {};
    if (stripeAccountId) {
      options.stripeAccount = stripeAccountId;
    }

    return await this.stripe.paymentMethods.attach(
      paymentMethodId,
      { customer: customerId },
      options,
    );
  }

  /**
   * Detach a payment method from a customer
   */
  async detachPaymentMethod(
    paymentMethodId: string,
    stripeAccountId?: string,
  ): Promise<Stripe.PaymentMethod> {
    this.logger.log(`Detaching payment method ${paymentMethodId}`);

    const options: Stripe.RequestOptions = {};
    if (stripeAccountId) {
      options.stripeAccount = stripeAccountId;
    }

    return await this.stripe.paymentMethods.detach(paymentMethodId, options);
  }

  /**
   * Get payment method details
   */
  async getPaymentMethod(
    paymentMethodId: string,
    stripeAccountId?: string,
  ): Promise<Stripe.PaymentMethod> {
    const options: Stripe.RequestOptions = {};
    if (stripeAccountId) {
      options.stripeAccount = stripeAccountId;
    }

    return await this.stripe.paymentMethods.retrieve(paymentMethodId, options);
  }

  /**
   * List payment methods for a customer
   */
  async listPaymentMethods(
    customerId: string,
    type: Stripe.PaymentMethodListParams.Type = 'card',
    stripeAccountId?: string,
  ): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
    const options: Stripe.RequestOptions = {};
    if (stripeAccountId) {
      options.stripeAccount = stripeAccountId;
    }

    return await this.stripe.paymentMethods.list(
      {
        customer: customerId,
        type: type,
      },
      options,
    );
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
   * Archive a price in Stripe Connect account by setting active to false
   */
  async archivePrice(
    priceId: string,
    stripeAccountId: string,
  ): Promise<Stripe.Price> {
    this.logger.log(
      `Archiving Stripe price ${priceId} in account ${stripeAccountId}`,
    );

    return await this.stripe.prices.update(
      priceId,
      { active: false },
      {
        stripeAccount: stripeAccountId,
      },
    );
  }

  /**
   * Create a subscription in Stripe Connect account
   */
  async createSubscription(
    params: Stripe.SubscriptionCreateParams,
    stripeAccountId: string,
    idempotencyKey?: string,
  ): Promise<Stripe.Subscription> {
    this.logger.log(
      `Creating Stripe subscription for customer ${params.customer} in account ${stripeAccountId}`,
    );

    return await this.stripe.subscriptions.create(params, {
      stripeAccount: stripeAccountId,
      ...(idempotencyKey && { idempotencyKey }),
    });
  }

  /**
   * Get subscription from Stripe Connect account
   */
  async getSubscription(
    subscriptionId: string,
    stripeAccountId?: string,
  ): Promise<Stripe.Subscription> {
    const options: Stripe.RequestOptions = {};
    if (stripeAccountId) options.stripeAccount = stripeAccountId;
    return await this.stripe.subscriptions.retrieve(subscriptionId, options);
  }

  /**
   * Cancel a subscription in Stripe Connect account
   */
  async cancelSubscription(
    subscriptionId: string,
    stripeAccountId: string,
    cancelAtPeriodEnd: boolean = true,
    idempotencyKey?: string,
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
          ...(idempotencyKey && { idempotencyKey }),
        },
      );
    } else {
      return await this.stripe.subscriptions.cancel(
        subscriptionId,
        {},
        {
          stripeAccount: stripeAccountId,
          ...(idempotencyKey && { idempotencyKey }),
        },
      );
    }
  }

  /**
   * List all subscriptions on a Stripe Connect account (uses auto-pagination)
   * Used for drift detection — compares Stripe state against local DB.
   */
  async listAccountSubscriptions(
    stripeAccountId: string,
  ): Promise<Stripe.Subscription[]> {
    const subscriptions: Stripe.Subscription[] = [];

    for await (const sub of this.stripe.subscriptions.list(
      { limit: 100, expand: ['data.items.data.price'] },
      { stripeAccount: stripeAccountId },
    )) {
      subscriptions.push(sub);
    }

    return subscriptions;
  }

  /**
   * Update a subscription in Stripe Connect account
   */
  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
    stripeAccountId: string,
    idempotencyKey?: string,
  ): Promise<Stripe.Subscription> {
    this.logger.log(
      `Updating Stripe subscription: ${subscriptionId} in account ${stripeAccountId}`,
    );

    return await this.stripe.subscriptions.update(subscriptionId, params, {
      stripeAccount: stripeAccountId,
      ...(idempotencyKey && { idempotencyKey }),
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

  /**
   * List all subscriptions for a customer from Stripe
   * Used for syncing Stripe data with our database
   */
  async listCustomerSubscriptions(params: {
    customerId: string;
    stripeAccountId?: string;
    status?:
      | 'active'
      | 'past_due'
      | 'unpaid'
      | 'canceled'
      | 'incomplete'
      | 'incomplete_expired'
      | 'trialing'
      | 'all';
  }): Promise<Stripe.ApiList<Stripe.Subscription>> {
    this.logger.log(`Listing subscriptions for customer: ${params.customerId}`);

    const listParams: Stripe.SubscriptionListParams = {
      customer: params.customerId,
      limit: 100,
    };

    // Add status filter if specified
    if (params.status && params.status !== 'all') {
      listParams.status = params.status;
    }

    const options: Stripe.RequestOptions = {};
    if (params.stripeAccountId) {
      options.stripeAccount = params.stripeAccountId;
    }

    return await this.stripe.subscriptions.list(listParams, options);
  }

  /**
   * Sync a single subscription from Stripe
   * Fetches the full subscription data including expanded fields
   */
  async syncSubscriptionFromStripe(params: {
    subscriptionId: string;
    stripeAccountId?: string;
  }): Promise<Stripe.Subscription> {
    this.logger.log(
      `Syncing subscription from Stripe: ${params.subscriptionId}`,
    );

    const options: Stripe.RequestOptions = {};
    if (params.stripeAccountId) {
      options.stripeAccount = params.stripeAccountId;
    }

    // For subscriptions.retrieve, we can pass expand as a query parameter
    return await this.stripe.subscriptions.retrieve(
      params.subscriptionId,
      {
        expand: ['items.data.price.product', 'customer'],
      },
      options,
    );
  }

  // ================================================
  // STRIPE COUPONS & PROMOTION CODES API METHODS
  // ================================================

  /**
   * Create a coupon in Stripe Connect account
   * https://docs.stripe.com/api/coupons/create
   */
  async createCoupon(
    params: Stripe.CouponCreateParams,
    stripeAccountId: string,
  ): Promise<Stripe.Coupon> {
    this.logger.log(`Creating Stripe coupon for account ${stripeAccountId}`);

    return await this.stripe.coupons.create(params, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * Update a coupon in Stripe Connect account
   * Note: Only name and metadata can be updated after creation
   * https://docs.stripe.com/api/coupons/update
   */
  async updateCoupon(
    couponId: string,
    params: Stripe.CouponUpdateParams,
    stripeAccountId: string,
  ): Promise<Stripe.Coupon> {
    this.logger.log(
      `Updating Stripe coupon: ${couponId} for account ${stripeAccountId}`,
    );

    return await this.stripe.coupons.update(couponId, params, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * Delete a coupon in Stripe Connect account
   * https://docs.stripe.com/api/coupons/delete
   */
  async deleteCoupon(
    couponId: string,
    stripeAccountId: string,
  ): Promise<Stripe.DeletedCoupon> {
    this.logger.log(
      `Deleting Stripe coupon: ${couponId} for account ${stripeAccountId}`,
    );

    return await this.stripe.coupons.del(couponId, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * Create a promotion code linked to a coupon in Stripe Connect account
   * https://docs.stripe.com/api/promotion_codes/create
   */
  async createPromotionCode(
    params: Stripe.PromotionCodeCreateParams,
    stripeAccountId: string,
  ): Promise<Stripe.PromotionCode> {
    this.logger.log(
      `Creating Stripe promotion code in account ${stripeAccountId}`,
    );

    return await this.stripe.promotionCodes.create(params, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * Update a promotion code in Stripe Connect account
   * https://docs.stripe.com/api/promotion_codes/update
   */
  async updatePromotionCode(
    promotionCodeId: string,
    params: Stripe.PromotionCodeUpdateParams,
    stripeAccountId: string,
  ): Promise<Stripe.PromotionCode> {
    this.logger.log(
      `Updating Stripe promotion code: ${promotionCodeId} for account ${stripeAccountId}`,
    );

    return await this.stripe.promotionCodes.update(promotionCodeId, params, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * Deactivate a promotion code in Stripe Connect account
   * https://docs.stripe.com/api/promotion_codes/update
   */
  async deactivatePromotionCode(
    promotionCodeId: string,
    stripeAccountId: string,
  ): Promise<Stripe.PromotionCode> {
    this.logger.log(
      `Deactivating Stripe promotion code: ${promotionCodeId} for account ${stripeAccountId}`,
    );

    return await this.stripe.promotionCodes.update(
      promotionCodeId,
      { active: false },
      {
        stripeAccount: stripeAccountId,
      },
    );
  }

  // ================================================
  // INVOICE METHODS
  // ================================================

  /**
   * List invoices for a Stripe Connect account with auto-pagination.
   * Fetches all matching invoices across pages.
   */
  async listInvoices(
    stripeAccountId: string,
    params: {
      status?: string;
      created?: { gte?: number; lte?: number };
      limit?: number;
      starting_after?: string;
    },
  ): Promise<Stripe.Invoice[]> {
    const invoices: Stripe.Invoice[] = [];
    let hasMore = true;
    let startingAfter = params.starting_after;

    while (hasMore) {
      const response = await this.stripe.invoices.list(
        {
          status: params.status as Stripe.InvoiceListParams.Status,
          created: params.created,
          limit: params.limit || 100,
          ...(startingAfter && { starting_after: startingAfter }),
        },
        { stripeAccount: stripeAccountId },
      );
      invoices.push(...response.data);
      hasMore = response.has_more;
      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }
    }

    return invoices;
  }

  /**
   * List invoices for a specific Stripe customer in a Connect account.
   * Returns the raw `Stripe.ApiList` so callers can inspect `has_more` if
   * paging is needed; defaults to the most recent 25.
   */
  async listCustomerInvoices(
    stripeCustomerId: string,
    stripeAccountId: string,
    limit = 25,
  ): Promise<Stripe.ApiList<Stripe.Invoice>> {
    return this.stripe.invoices.list(
      { customer: stripeCustomerId, limit },
      { stripeAccount: stripeAccountId },
    );
  }

  // ================================================
  // SUBSCRIPTION UPGRADE/DOWNGRADE METHODS
  // ================================================

  /**
   * Retrieve upcoming invoice preview for subscription changes
   * Used to show customers what they'll be charged before upgrading/downgrading
   * https://docs.stripe.com/api/invoices/upcoming
   */
  async retrieveUpcomingInvoice(
    subscriptionId: string,
    customerId: string,
    newPriceId: string,
    stripeAccountId: string,
  ): Promise<Stripe.Invoice> {
    this.logger.log(
      `Retrieving upcoming invoice preview for subscription ${subscriptionId} with new price ${newPriceId}`,
    );

    // First, get the current subscription to find the subscription item ID
    const subscription = await this.getSubscription(
      subscriptionId,
      stripeAccountId,
    );

    if (!subscription.items?.data?.[0]) {
      throw new Error('Subscription has no items');
    }

    const subscriptionItemId = subscription.items.data[0].id;

    // Preview the upcoming invoice with the new price
    // Stripe SDK v20+ uses invoices.createPreview() instead of retrieveUpcoming()
    return await this.stripe.invoices.createPreview(
      {
        customer: customerId,
        subscription: subscriptionId,
        subscription_details: {
          items: [
            {
              id: subscriptionItemId,
              price: newPriceId,
            },
          ],
          proration_behavior: 'create_prorations',
        },
      },
      {
        stripeAccount: stripeAccountId,
      },
    );
  }

  /**
   * Update subscription to a new price (upgrade/downgrade)
   * Stripe handles proration automatically
   * https://docs.stripe.com/api/subscriptions/update
   */
  async updateSubscriptionPrice(
    subscriptionId: string,
    newPriceId: string,
    stripeAccountId: string,
    options?: {
      prorationBehavior?: 'create_prorations' | 'always_invoice' | 'none';
      billingCycleAnchor?: 'now' | 'unchanged';
    },
  ): Promise<Stripe.Subscription> {
    this.logger.log(
      `Updating subscription ${subscriptionId} to new price ${newPriceId}`,
    );

    // First, get the current subscription to find the subscription item ID
    const subscription = await this.getSubscription(
      subscriptionId,
      stripeAccountId,
    );

    if (!subscription.items?.data?.[0]) {
      throw new Error('Subscription has no items');
    }

    const subscriptionItemId = subscription.items.data[0].id;

    // Update the subscription with new price
    return await this.stripe.subscriptions.update(
      subscriptionId,
      {
        items: [
          {
            id: subscriptionItemId,
            price: newPriceId,
          },
        ],
        proration_behavior: options?.prorationBehavior ?? 'create_prorations',
        billing_cycle_anchor: options?.billingCycleAnchor ?? 'unchanged',
      },
      {
        stripeAccount: stripeAccountId,
      },
    );
  }

  // ── Invoice helpers (used by ProrationInvoiceService) ──

  /**
   * Flexible variant of `subscriptions.update` for the orchestrator. The
   * caller fully owns the params (items, proration_behavior, payment_behavior,
   * expand, etc.). Use this when the simpler `updateSubscriptionPrice` doesn't
   * fit.
   */
  async updateSubscriptionWithParams(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
    stripeAccountId: string,
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, params, {
      stripeAccount: stripeAccountId,
    });
  }

  /**
   * List pending (un-invoiced) invoice items for a customer. Used to detect
   * whether a `subscriptions.update` actually generated proration line items
   * worth invoicing.
   */
  async listPendingInvoiceItems(
    stripeCustomerId: string,
    stripeAccountId: string,
  ): Promise<Stripe.InvoiceItem[]> {
    const result = await this.stripe.invoiceItems.list(
      { customer: stripeCustomerId, pending: true, limit: 100 },
      { stripeAccount: stripeAccountId },
    );
    return result.data;
  }

  /**
   * Create an invoice. Wraps `auto_advance: false` so the orchestrator can
   * decide finalize/pay timing explicitly.
   */
  async createInvoice(
    params: Stripe.InvoiceCreateParams,
    stripeAccountId: string,
    idempotencyKey?: string,
  ): Promise<Stripe.Invoice> {
    return this.stripe.invoices.create(params, {
      stripeAccount: stripeAccountId,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  }

  async finalizeInvoice(
    invoiceId: string,
    stripeAccountId: string,
    opts?: Stripe.InvoiceFinalizeInvoiceParams,
  ): Promise<Stripe.Invoice> {
    return this.stripe.invoices.finalizeInvoice(
      invoiceId,
      opts ?? { auto_advance: false },
      { stripeAccount: stripeAccountId },
    );
  }

  async payInvoice(
    invoiceId: string,
    stripeAccountId: string,
    opts?: Stripe.InvoicePayParams,
  ): Promise<Stripe.Invoice> {
    return this.stripe.invoices.pay(invoiceId, opts ?? {}, {
      stripeAccount: stripeAccountId,
    });
  }

  async voidInvoice(
    invoiceId: string,
    stripeAccountId: string,
  ): Promise<Stripe.Invoice> {
    return this.stripe.invoices.voidInvoice(invoiceId, undefined, {
      stripeAccount: stripeAccountId,
    });
  }

  async retrieveInvoice(
    invoiceId: string,
    stripeAccountId?: string,
    expand?: string[],
  ): Promise<Stripe.Invoice> {
    const options: Stripe.RequestOptions = {};
    if (stripeAccountId) options.stripeAccount = stripeAccountId;
    return this.stripe.invoices.retrieve(
      invoiceId,
      expand && expand.length > 0 ? { expand } : undefined,
      options,
    );
  }

  /**
   * Idempotency recovery: search for an existing draft invoice tagged with
   * the given checkout session ID. If `runUpgrade` crashes after creating an
   * invoice but before finalizing it, the next attempt picks up where it left
   * off instead of creating a duplicate.
   */
  async searchDraftInvoiceBySession(
    stripeCustomerId: string,
    checkoutSessionId: string,
    stripeAccountId: string,
  ): Promise<Stripe.Invoice | null> {
    const result = await this.stripe.invoices.list(
      {
        customer: stripeCustomerId,
        status: 'draft',
        limit: 100,
      },
      { stripeAccount: stripeAccountId },
    );
    const match = result.data.find(
      (inv) => inv.metadata?.bosCheckoutSessionId === checkoutSessionId,
    );
    return match ?? null;
  }

  /**
   * Connect-aware customer fetch. The original `getCustomer` is account-less
   * (used by platform-side flows); this variant scopes to a connected account.
   */
  async getConnectCustomer(
    stripeCustomerId: string,
    stripeAccountId: string,
  ): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    return this.stripe.customers.retrieve(stripeCustomerId, {
      stripeAccount: stripeAccountId,
    });
  }

  async createCustomerBalanceTransaction(
    stripeCustomerId: string,
    amount: number,
    currency: string,
    stripeAccountId: string,
    description?: string,
  ): Promise<Stripe.CustomerBalanceTransaction> {
    return this.stripe.customers.createBalanceTransaction(
      stripeCustomerId,
      {
        amount, // negative = credit (reduces what customer owes)
        currency,
        description: description ?? 'Proration credit from plan change',
      },
      { stripeAccount: stripeAccountId },
    );
  }
}
