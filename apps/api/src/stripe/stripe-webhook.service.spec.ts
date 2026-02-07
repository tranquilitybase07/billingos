import { Test, TestingModule } from '@nestjs/testing';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeService } from './stripe.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CustomersService } from '../customers/customers.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { Logger, forwardRef } from '@nestjs/common';
import Stripe from 'stripe';

describe('StripeWebhookService - Subscription Creation Flow', () => {
  let service: StripeWebhookService;
  let stripeService: StripeService;
  let supabaseService: SupabaseService;
  let customersService: CustomersService;
  let subscriptionsService: SubscriptionsService;

  // Mock Supabase client
  const mockSupabaseClient = {
    from: jest.fn(),
  };

  // Mock Stripe service
  const mockStripeService = {
    attachPaymentMethodToCustomer: jest.fn(),
    updateCustomer: jest.fn(),
    createSubscription: jest.fn(),
    cancelSubscription: jest.fn(),
  };

  // Mock Customers service
  const mockCustomersService = {
    upsertCustomer: jest.fn(),
  };

  // Mock Subscriptions service
  const mockSubscriptionsService = {
    create: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
    syncActiveEntitlementsFromStripe: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhookService,
        {
          provide: StripeService,
          useValue: mockStripeService,
        },
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn().mockReturnValue(mockSupabaseClient),
          },
        },
        {
          provide: CustomersService,
          useValue: mockCustomersService,
        },
        {
          provide: SubscriptionsService,
          useValue: mockSubscriptionsService,
        },
      ],
    }).compile();

    service = module.get<StripeWebhookService>(StripeWebhookService);
    stripeService = module.get<StripeService>(StripeService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    customersService = module.get<CustomersService>(CustomersService);
    subscriptionsService = module.get<SubscriptionsService>(SubscriptionsService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('handlePaymentIntentSucceeded', () => {
    it('should create subscription after successful payment', async () => {
      // Setup test data
      const paymentIntent: Partial<Stripe.PaymentIntent> = {
        id: 'pi_test123',
        customer: 'cus_test123',
        payment_method: 'pm_test123',
        status: 'succeeded',
        metadata: {
          organizationId: 'org_123',
          externalUserId: 'ext_user_123',
          productId: 'prod_123',
          priceId: 'price_123',
          customerEmail: 'test@example.com',
          customerName: 'Test Customer',
        },
      };

      const mockPaymentIntentRecord = {
        id: 'pi_record_123',
        customer_id: null,
        price_id: 'price_123',
      };

      const mockCustomer = {
        id: 'customer_123',
        organization_id: 'org_123',
        stripe_customer_id: 'cus_test123',
      };

      const mockOrganization = {
        accounts: {
          stripe_id: 'acct_test123',
        },
      };

      const mockPrice = {
        stripe_price_id: 'price_stripe_123',
        price_amount: 1000,
        price_currency: 'usd',
      };

      const mockStripeSubscription = {
        id: 'sub_test123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      };

      const mockSubscription = {
        id: 'sub_record_123',
        customer_id: 'customer_123',
        product_id: 'prod_123',
        price_id: 'price_123',
      };

      const mockProductFeatures = [
        {
          feature_id: 'feat_1',
          config: { limit: 1000 },
        },
        {
          feature_id: 'feat_2',
          config: { enabled: true },
        },
      ];

      // Setup mock returns
      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'payment_intents') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: mockPaymentIntentRecord,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'checkout_sessions') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }

        if (table === 'customers') {
          return {
            upsert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockCustomer,
                  error: null,
                }),
              }),
            }),
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockCustomer,
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'organizations') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockOrganization,
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'product_prices') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockPrice,
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'subscriptions') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockSubscription,
                  error: null,
                }),
              }),
            }),
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'product_features') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: mockProductFeatures,
                error: null,
              }),
            }),
          };
        }

        if (table === 'feature_grants') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
            insert: jest.fn().mockResolvedValue({
              error: null,
            }),
          };
        }

        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      // Setup Stripe mocks
      mockStripeService.attachPaymentMethodToCustomer.mockResolvedValue({
        id: 'pm_test123',
      });

      mockStripeService.updateCustomer.mockResolvedValue({
        id: 'cus_test123',
      });

      mockStripeService.createSubscription.mockResolvedValue(mockStripeSubscription);

      // Execute the handler
      await service['handlePaymentIntentSucceeded'](paymentIntent as Stripe.PaymentIntent);

      // Verify critical operations occurred
      expect(mockStripeService.attachPaymentMethodToCustomer).toHaveBeenCalledWith(
        'pm_test123',
        'cus_test123',
        'acct_test123',
      );

      expect(mockStripeService.updateCustomer).toHaveBeenCalledWith(
        'cus_test123',
        {
          invoice_settings: {
            default_payment_method: 'pm_test123',
          },
        },
        'acct_test123',
      );

      expect(mockStripeService.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test123',
          items: [{ price: 'price_stripe_123' }],
          default_payment_method: 'pm_test123',
          metadata: expect.objectContaining({
            organizationId: 'org_123',
            productId: 'prod_123',
            priceId: 'price_123',
          }),
        }),
        'acct_test123',
      );

      // Verify subscription was created in database
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('subscriptions');

      // Verify feature grants were created
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('feature_grants');
    });

    it('should handle customer upsert race condition with retry', async () => {
      const paymentIntent: Partial<Stripe.PaymentIntent> = {
        id: 'pi_test123',
        customer: 'cus_test123',
        status: 'succeeded',
        metadata: {
          organizationId: 'org_123',
          productId: 'prod_123',
          priceId: 'price_123',
        },
      };

      const mockPaymentIntentRecord = {
        id: 'pi_record_123',
        customer_id: null,
      };

      // Simulate race condition on first attempt, success on retry
      let attemptCount = 0;
      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'payment_intents') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: mockPaymentIntentRecord,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'customers') {
          attemptCount++;
          if (attemptCount === 1) {
            // First attempt: simulate conflict
            return {
              upsert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: null,
                    error: { code: '23505', message: 'Unique constraint violation' },
                  }),
                }),
              }),
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'customer_123', organization_id: 'org_123' },
                    error: null,
                  }),
                }),
              }),
            };
          } else {
            // Retry: success
            return {
              upsert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'customer_123', organization_id: 'org_123' },
                    error: null,
                  }),
                }),
              }),
            };
          }
        }

        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      });

      // Execute - should handle race condition gracefully
      await service['handlePaymentIntentSucceeded'](paymentIntent as Stripe.PaymentIntent);

      // Verify customer was eventually created/found
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('customers');
    });

    it('should not create duplicate subscriptions', async () => {
      const paymentIntent: Partial<Stripe.PaymentIntent> = {
        id: 'pi_test123',
        customer: 'cus_test123',
        status: 'succeeded',
        metadata: {
          organizationId: 'org_123',
          productId: 'prod_123',
          priceId: 'price_123',
        },
      };

      const existingSubscription = {
        id: 'existing_sub_123',
        stripe_subscription_id: 'sub_existing',
      };

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: existingSubscription,
                  error: null,
                }),
              }),
            }),
          };
        }

        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      });

      await service['handlePaymentIntentSucceeded'](paymentIntent as Stripe.PaymentIntent);

      // Should not create a new subscription
      expect(mockStripeService.createSubscription).not.toHaveBeenCalled();
    });

    it('should handle missing metadata gracefully', async () => {
      const paymentIntent: Partial<Stripe.PaymentIntent> = {
        id: 'pi_test123',
        customer: 'cus_test123',
        status: 'succeeded',
        metadata: {}, // Missing required fields
      };

      const mockPaymentIntentRecord = {
        id: 'pi_record_123',
      };

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'payment_intents') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: mockPaymentIntentRecord,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handlePaymentIntentSucceeded'](paymentIntent as Stripe.PaymentIntent);

      // Should exit early without creating subscription
      expect(mockStripeService.createSubscription).not.toHaveBeenCalled();
    });

    it('should rollback Stripe subscription if database save fails', async () => {
      const paymentIntent: Partial<Stripe.PaymentIntent> = {
        id: 'pi_test123',
        customer: 'cus_test123',
        payment_method: 'pm_test123',
        status: 'succeeded',
        metadata: {
          organizationId: 'org_123',
          productId: 'prod_123',
          priceId: 'price_123',
        },
      };

      const mockStripeSubscription = {
        id: 'sub_test123',
        status: 'active',
      };

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'subscriptions') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database error' },
                }),
              }),
            }),
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          };
        }

        // Default mock for other tables
        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: {}, error: null }),
          }),
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'test',
                  accounts: { stripe_id: 'acct_test' },
                  stripe_price_id: 'price_test',
                },
                error: null
              }),
            }),
          }),
          upsert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'customer_123' },
                error: null,
              }),
            }),
          }),
        };
      });

      mockStripeService.createSubscription.mockResolvedValue(mockStripeSubscription);

      await service['handlePaymentIntentSucceeded'](paymentIntent as Stripe.PaymentIntent);

      // Should attempt to cancel the Stripe subscription
      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith(
        'sub_test123',
        expect.any(String),
      );
    });
  });
});