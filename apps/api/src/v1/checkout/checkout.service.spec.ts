import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { CustomersService } from '../../customers/customers.service';
import { StripeService } from '../../stripe/stripe.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('CheckoutService - Critical Path Tests', () => {
  let service: CheckoutService;
  let supabaseService: SupabaseService;
  let customersService: CustomersService;
  let stripeService: StripeService;

  const mockSupabaseClient = {
    from: jest.fn(),
  };

  const mockCustomersService = {
    upsertCustomer: jest.fn(),
  };

  const mockStripeClient = {
    paymentIntents: {
      create: jest.fn(),
      confirm: jest.fn(),
      cancel: jest.fn(),
    },
  };

  const mockStripeService = {
    getClient: jest.fn().mockReturnValue(mockStripeClient),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
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
          provide: StripeService,
          useValue: mockStripeService,
        },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    customersService = module.get<CustomersService>(CustomersService);
    stripeService = module.get<StripeService>(StripeService);

    jest.clearAllMocks();
  });

  describe('createCheckout', () => {
    it('should create a checkout session with payment intent', async () => {
      const createCheckoutDto = {
        organizationId: 'org_123',
        productPriceId: 'price_123',
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        externalUserId: 'ext_user_123',
        metadata: { source: 'sdk' },
      };

      const mockProduct = {
        id: 'prod_123',
        name: 'Test Product',
        trial_days: 7,
      };

      const mockPrice = {
        id: 'price_123',
        price_amount: 1000,
        price_currency: 'usd',
        recurring_interval: 'month',
        recurring_interval_count: 1,
      };

      const mockOrganization = {
        id: 'org_123',
        accounts: {
          stripe_id: 'acct_test123',
        },
      };

      const mockCustomer = {
        id: 'customer_123',
        stripe_customer_id: 'cus_test123',
      };

      const mockPaymentIntent = {
        id: 'pi_test123',
        client_secret: 'pi_test123_secret_test',
        status: 'requires_payment_method',
      };

      const mockPaymentIntentRecord = {
        id: 'pi_record_123',
      };

      const mockCheckoutSession = {
        id: 'cs_123',
      };

      const mockProductFeatures = [
        { features: { title: 'Feature 1' } },
        { features: { title: 'Feature 2' } },
      ];

      // Setup mocks
      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'products') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockProduct,
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

        if (table === 'payment_intents') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockPaymentIntentRecord,
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'checkout_sessions') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockCheckoutSession,
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'product_features') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: mockProductFeatures,
                  error: null,
                }),
              }),
            }),
          };
        }

        return {
          select: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      mockCustomersService.upsertCustomer.mockResolvedValue(mockCustomer);
      mockStripeClient.paymentIntents.create.mockResolvedValue(mockPaymentIntent);

      // Execute
      const result = await service.createCheckout(createCheckoutDto);

      // Verify
      expect(result).toEqual({
        id: 'cs_123',
        clientSecret: 'pi_test123_secret_test',
        paymentIntentId: 'pi_test123',
        amount: 1000,
        currency: 'usd',
        product: {
          name: 'Test Product',
          interval: 'month',
          intervalCount: 1,
          features: ['Feature 1', 'Feature 2'],
        },
        customer: {
          email: 'test@example.com',
          name: 'Test Customer',
        },
        stripeAccountId: 'acct_test123',
        trialDays: 7,
      });

      // Verify customer was upserted
      expect(mockCustomersService.upsertCustomer).toHaveBeenCalledWith({
        organization_id: 'org_123',
        email: 'test@example.com',
        name: 'Test Customer',
        external_id: 'ext_user_123',
        metadata: { source: 'sdk' },
      });

      // Verify payment intent was created with correct metadata
      expect(mockStripeClient.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1000,
          currency: 'usd',
          customer: 'cus_test123',
          metadata: expect.objectContaining({
            organizationId: 'org_123',
            productId: 'prod_123',
            priceId: 'price_123',
            externalUserId: 'ext_user_123',
            customerEmail: 'test@example.com',
            customerName: 'Test Customer',
            trialDays: '7',
          }),
        }),
        expect.objectContaining({
          stripeAccount: 'acct_test123',
        }),
      );
    });

    it('should handle missing product gracefully', async () => {
      const createCheckoutDto = {
        organizationId: 'org_123',
        productPriceId: 'price_nonexistent',
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        externalUserId: 'ext_user_123',
      };

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'products') {
          return {
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

        if (table === 'product_prices') {
          return {
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

        return {
          select: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      await expect(service.createCheckout(createCheckoutDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should cleanup payment intent if database save fails', async () => {
      const createCheckoutDto = {
        organizationId: 'org_123',
        productPriceId: 'price_123',
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        externalUserId: 'ext_user_123',
      };

      const mockPaymentIntent = {
        id: 'pi_test123',
        client_secret: 'pi_test123_secret_test',
      };

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'payment_intents') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database error' },
                }),
              }),
            }),
          };
        }

        // Return valid data for other tables
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'test',
                  price_amount: 1000,
                  price_currency: 'usd',
                  accounts: { stripe_id: 'acct_test' },
                },
                error: null,
              }),
            }),
          }),
        };
      });

      mockCustomersService.upsertCustomer.mockResolvedValue({
        id: 'customer_123',
        stripe_customer_id: 'cus_test123',
      });

      mockStripeClient.paymentIntents.create.mockResolvedValue(mockPaymentIntent);
      mockStripeClient.paymentIntents.cancel.mockResolvedValue({});

      await expect(service.createCheckout(createCheckoutDto)).rejects.toThrow(
        BadRequestException,
      );

      // Verify payment intent was cancelled
      expect(mockStripeClient.paymentIntents.cancel).toHaveBeenCalledWith('pi_test123');
    });
  });

  describe('confirmCheckout', () => {
    it('should confirm payment and update status', async () => {
      const clientSecret = 'pi_test123_secret_test';
      const confirmDto = {
        paymentMethodId: 'pm_test123',
      };

      const mockPaymentIntentRecord = {
        id: 'pi_record_123',
        stripe_account_id: 'acct_test123',
        customer_id: 'customer_123',
        product_id: 'prod_123',
        price_id: 'price_123',
      };

      const mockConfirmedPaymentIntent = {
        id: 'pi_test123',
        status: 'succeeded',
        payment_method: 'pm_test123',
      };

      const mockCheckoutSession = {
        id: 'cs_123',
      };

      const mockSubscription = {
        id: 'sub_123',
      };

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'payment_intents') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockPaymentIntentRecord,
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          };
        }

        if (table === 'checkout_sessions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockCheckoutSession,
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: null,
                error: null,
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
          };
        }

        return {
          select: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      mockStripeClient.paymentIntents.confirm.mockResolvedValue(mockConfirmedPaymentIntent);

      // Execute
      const result = await service.confirmCheckout(clientSecret, confirmDto);

      // Verify
      expect(result).toEqual({
        status: 'succeeded',
        requiresAction: false,
        success: true,
        subscriptionId: 'sub_123',
      });

      expect(mockStripeClient.paymentIntents.confirm).toHaveBeenCalledWith(
        'pi_test123',
        {
          payment_method: 'pm_test123',
        },
        {
          stripeAccount: 'acct_test123',
        },
      );
    });

    it('should handle 3D Secure requirements', async () => {
      const clientSecret = 'pi_test123_secret_test';
      const confirmDto = {
        paymentMethodId: 'pm_test123',
      };

      const mockPaymentIntentRecord = {
        stripe_account_id: 'acct_test123',
      };

      const mockPaymentIntentWith3DS = {
        id: 'pi_test123',
        status: 'requires_action',
        next_action: {
          type: 'redirect_to_url',
          redirect_to_url: {
            url: 'https://stripe.com/3ds/auth',
          },
        },
      };

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'payment_intents') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockPaymentIntentRecord,
                  error: null,
                }),
              }),
            }),
          };
        }

        return {
          select: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      mockStripeClient.paymentIntents.confirm.mockResolvedValue(mockPaymentIntentWith3DS);

      // Execute
      const result = await service.confirmCheckout(clientSecret, confirmDto);

      // Verify
      expect(result).toEqual({
        status: 'requires_action',
        requiresAction: true,
        actionUrl: 'https://stripe.com/3ds/auth',
        success: false,
      });
    });

    it('should handle payment failure gracefully', async () => {
      const clientSecret = 'pi_test123_secret_test';
      const confirmDto = {
        paymentMethodId: 'pm_test123',
      };

      const mockPaymentIntentRecord = {
        stripe_account_id: 'acct_test123',
      };

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'payment_intents') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockPaymentIntentRecord,
                  error: null,
                }),
              }),
            }),
          };
        }

        return {
          select: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const stripeError = new Error('Card declined');
      stripeError['type'] = 'StripeCardError';
      mockStripeClient.paymentIntents.confirm.mockRejectedValue(stripeError);

      // Execute and verify
      await expect(service.confirmCheckout(clientSecret, confirmDto)).rejects.toThrow(
        'Card error: Card declined',
      );
    });
  });
});