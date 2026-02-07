import { jest } from '@jest/globals';
import Stripe from 'stripe';

/**
 * MockStripeService - Comprehensive mock for Stripe service
 *
 * This class provides mocks for all Stripe operations used in the application.
 * It includes methods for products, prices, features, subscriptions, and more.
 */
export class MockStripeService {
  // Product methods
  createProduct = jest.fn();
  updateProduct = jest.fn();
  deleteProduct = jest.fn();
  retrieveProduct = jest.fn();
  listProducts = jest.fn();

  // Price methods
  createPrice = jest.fn();
  updatePrice = jest.fn();
  archivePrice = jest.fn();
  retrievePrice = jest.fn();
  listPrices = jest.fn();

  // Feature methods (Product Features API)
  attachFeatureToProduct = jest.fn();
  detachFeatureFromProduct = jest.fn();
  listProductFeatures = jest.fn();

  // Subscription methods
  createSubscription = jest.fn();
  updateSubscription = jest.fn();
  cancelSubscription = jest.fn();
  retrieveSubscription = jest.fn();
  listSubscriptions = jest.fn();
  listCustomerSubscriptions = jest.fn();

  // Customer methods
  createCustomer = jest.fn();
  updateCustomer = jest.fn();
  deleteCustomer = jest.fn();
  retrieveCustomer = jest.fn();

  // Payment Intent methods
  createPaymentIntent = jest.fn();
  retrievePaymentIntent = jest.fn();
  confirmPaymentIntent = jest.fn();

  // Checkout Session methods
  createCheckoutSession = jest.fn();
  retrieveCheckoutSession = jest.fn();

  // Account methods (Connect)
  createAccount = jest.fn();
  updateAccount = jest.fn();
  deleteAccount = jest.fn();
  retrieveAccount = jest.fn();
  createAccountLink = jest.fn();
  createLoginLink = jest.fn();

  // Webhook methods
  constructEvent = jest.fn();

  constructor() {
    this.setupDefaults();
  }

  /**
   * Set up default successful responses for all methods
   */
  setupDefaults() {
    // Product defaults
    this.createProduct.mockResolvedValue(this.createStripeProduct());
    this.updateProduct.mockResolvedValue(this.createStripeProduct());
    this.deleteProduct.mockResolvedValue({ id: 'prod_deleted', deleted: true });
    this.retrieveProduct.mockResolvedValue(this.createStripeProduct());
    this.listProducts.mockResolvedValue({ data: [this.createStripeProduct()] });

    // Price defaults
    this.createPrice.mockResolvedValue(this.createStripePrice());
    this.updatePrice.mockResolvedValue(this.createStripePrice());
    this.archivePrice.mockResolvedValue({ ...this.createStripePrice(), active: false });
    this.retrievePrice.mockResolvedValue(this.createStripePrice());
    this.listPrices.mockResolvedValue({ data: [this.createStripePrice()] });

    // Feature defaults
    this.attachFeatureToProduct.mockResolvedValue({
      id: 'prodft_test',
      object: 'product_feature',
      entitlement_feature: { id: 'feat_test' }
    });
    this.detachFeatureFromProduct.mockResolvedValue({ deleted: true });

    // Subscription defaults
    this.createSubscription.mockResolvedValue(this.createStripeSubscription());
    this.updateSubscription.mockResolvedValue(this.createStripeSubscription());
    this.cancelSubscription.mockResolvedValue({
      ...this.createStripeSubscription(),
      status: 'canceled'
    });
    this.retrieveSubscription.mockResolvedValue(this.createStripeSubscription());
    this.listSubscriptions.mockResolvedValue({ data: [this.createStripeSubscription()] });
    this.listCustomerSubscriptions.mockResolvedValue({
      data: [this.createStripeSubscription()]
    });

    // Customer defaults
    this.createCustomer.mockResolvedValue(this.createStripeCustomer());
    this.updateCustomer.mockResolvedValue(this.createStripeCustomer());
    this.deleteCustomer.mockResolvedValue({ id: 'cus_deleted', deleted: true });
    this.retrieveCustomer.mockResolvedValue(this.createStripeCustomer());

    // Payment Intent defaults
    this.createPaymentIntent.mockResolvedValue(this.createStripePaymentIntent());
    this.retrievePaymentIntent.mockResolvedValue(this.createStripePaymentIntent());
    this.confirmPaymentIntent.mockResolvedValue({
      ...this.createStripePaymentIntent(),
      status: 'succeeded'
    });

    // Checkout Session defaults
    this.createCheckoutSession.mockResolvedValue(this.createStripeCheckoutSession());
    this.retrieveCheckoutSession.mockResolvedValue(this.createStripeCheckoutSession());

    // Account defaults (Connect)
    this.createAccount.mockResolvedValue(this.createStripeAccount());
    this.updateAccount.mockResolvedValue(this.createStripeAccount());
    this.retrieveAccount.mockResolvedValue(this.createStripeAccount());
    this.createAccountLink.mockResolvedValue({
      object: 'account_link',
      url: 'https://connect.stripe.com/onboarding/test',
      expires_at: Date.now() + 3600000,
    });
    this.createLoginLink.mockResolvedValue({
      object: 'login_link',
      url: 'https://dashboard.stripe.com/test/dashboard',
    });

    // Webhook defaults
    this.constructEvent.mockImplementation((payload, signature, secret) => payload);
  }

  /**
   * Helper to simulate a Stripe API error
   */
  simulateError(methodName: keyof MockStripeService, error: Stripe.StripeAPIError | Error) {
    const method = this[methodName];
    if (typeof method === 'function' && 'mockRejectedValue' in method) {
      method.mockRejectedValue(error);
    }
  }

  /**
   * Helper to simulate multiple errors
   */
  simulateErrors(errors: Record<keyof MockStripeService, Error>) {
    Object.entries(errors).forEach(([method, error]) => {
      this.simulateError(method as keyof MockStripeService, error);
    });
  }

  /**
   * Reset all mocks
   */
  reset() {
    Object.keys(this).forEach((key) => {
      const prop = this[key as keyof MockStripeService];
      if (typeof prop === 'function' && 'mockReset' in prop) {
        prop.mockReset();
      }
    });
    this.setupDefaults();
  }

  /**
   * Clear all mock calls but keep default implementations
   */
  clearCalls() {
    Object.keys(this).forEach((key) => {
      const prop = this[key as keyof MockStripeService];
      if (typeof prop === 'function' && 'mockClear' in prop) {
        prop.mockClear();
      }
    });
  }

  // Helper methods to create Stripe objects with proper types

  private createStripeProduct(): Partial<Stripe.Product> {
    return {
      id: 'prod_test123',
      object: 'product',
      name: 'Test Product',
      description: 'Test product description',
      active: true,
      created: Date.now() / 1000,
      updated: Date.now() / 1000,
      metadata: {},
      default_price: null,
    };
  }

  private createStripePrice(): Partial<Stripe.Price> {
    return {
      id: 'price_test123',
      object: 'price',
      product: 'prod_test123',
      active: true,
      currency: 'usd',
      unit_amount: 999,
      recurring: {
        interval: 'month',
        interval_count: 1,
        trial_period_days: null,
        usage_type: 'licensed',
      },
      type: 'recurring',
      created: Date.now() / 1000,
      metadata: {},
    };
  }

  private createStripeSubscription(): Partial<Stripe.Subscription> {
    return {
      id: 'sub_test123',
      object: 'subscription',
      customer: 'cus_test123',
      status: 'active',
      current_period_start: Date.now() / 1000,
      current_period_end: (Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000,
      items: {
        object: 'list',
        data: [{
          id: 'si_test123',
          object: 'subscription_item',
          price: this.createStripePrice() as Stripe.Price,
          quantity: 1,
        }],
        has_more: false,
        url: '',
      },
      created: Date.now() / 1000,
      metadata: {},
    };
  }

  private createStripeCustomer(): Partial<Stripe.Customer> {
    return {
      id: 'cus_test123',
      object: 'customer',
      email: 'test@example.com',
      name: 'Test Customer',
      created: Date.now() / 1000,
      metadata: {},
    };
  }

  private createStripePaymentIntent(): Partial<Stripe.PaymentIntent> {
    return {
      id: 'pi_test123',
      object: 'payment_intent',
      amount: 999,
      currency: 'usd',
      status: 'requires_payment_method',
      customer: 'cus_test123',
      created: Date.now() / 1000,
      metadata: {},
    };
  }

  private createStripeCheckoutSession(): Partial<Stripe.Checkout.Session> {
    return {
      id: 'cs_test123',
      object: 'checkout.session',
      customer: 'cus_test123',
      payment_status: 'unpaid',
      status: 'open',
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      url: 'https://checkout.stripe.com/test',
      expires_at: Date.now() / 1000 + 3600,
      metadata: {},
    };
  }

  private createStripeAccount(): Partial<Stripe.Account> {
    return {
      id: 'acct_test123',
      object: 'account',
      type: 'express',
      email: 'test@example.com',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      created: Date.now() / 1000,
      metadata: {},
    };
  }
}

/**
 * Factory function to create a mock Stripe service with custom configuration
 */
export function createMockStripeService(config?: {
  defaultError?: Error;
  customResponses?: Partial<Record<keyof MockStripeService, any>>;
}) {
  const mockService = new MockStripeService();

  if (config?.defaultError) {
    Object.keys(mockService).forEach((key) => {
      const prop = mockService[key as keyof MockStripeService];
      if (typeof prop === 'function' && 'mockRejectedValue' in prop) {
        prop.mockRejectedValue(config.defaultError);
      }
    });
  }

  if (config?.customResponses) {
    Object.entries(config.customResponses).forEach(([method, response]) => {
      const prop = mockService[method as keyof MockStripeService];
      if (typeof prop === 'function' && 'mockResolvedValue' in prop) {
        prop.mockResolvedValue(response);
      }
    });
  }

  return mockService;
}

/**
 * Create a Stripe API error for testing error handling
 */
export function createStripeError(
  type: string = 'invalid_request_error',
  message: string = 'Test error',
  code?: string
): Partial<Stripe.StripeAPIError> {
  return {
    type: type as any,
    message,
    code: code as any,
    statusCode: 400,
  };
}