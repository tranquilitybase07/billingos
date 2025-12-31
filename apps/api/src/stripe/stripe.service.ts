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
}
