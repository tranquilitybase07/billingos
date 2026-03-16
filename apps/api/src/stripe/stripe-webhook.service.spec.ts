import { Test, TestingModule } from '@nestjs/testing';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeService } from './stripe.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CustomersService } from '../customers/customers.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { RedisService } from '../redis/redis.service';
import { RefundService } from './refund.service';
import { QueueService } from '../queue/queue.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import Stripe from 'stripe';

describe('StripeWebhookService', () => {
  let service: StripeWebhookService;
  let _stripeService: StripeService;
  let _supabaseService: SupabaseService;
  let _customersService: CustomersService;
  let _subscriptionsService: SubscriptionsService;

  // Mock Supabase client
  const mockSupabaseClient = {
    from: jest.fn(),
    rpc: jest.fn(),
  };

  // Mock Stripe SDK client (for getClient())
  const mockStripeClient = {
    subscriptions: {
      retrieve: jest.fn(),
    },
    invoices: {
      retrieve: jest.fn(),
    },
  };

  // Mock Stripe service
  const mockStripeService = {
    attachPaymentMethodToCustomer: jest.fn(),
    updateCustomer: jest.fn(),
    createSubscription: jest.fn(),
    cancelSubscription: jest.fn(),
    getClient: jest.fn().mockReturnValue(mockStripeClient),
    getConnectAccount: jest.fn(),
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
    revokeSubscriptionFeatures: jest.fn(),
    grantProductFeatures: jest.fn(),
    handleRenewal: jest.fn(),
  };

  // Mock Cache Manager
  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  // Mock Redis service
  const mockRedisService = {
    setIdempotencyKey: jest.fn().mockResolvedValue(true),
    checkIdempotencyKey: jest.fn().mockResolvedValue(false),
    delete: jest.fn(),
  };

  // Mock Refund service
  const mockRefundService = {
    refundPaymentOnFailure: jest.fn(),
  };

  // Mock Queue service
  const mockQueueService = {
    sendReconciliation: jest.fn().mockResolvedValue(1),
    sendAlert: jest.fn().mockResolvedValue(1),
  };

  /**
   * Creates a deeply-chainable Supabase mock that resolves to { data, error }.
   * Supports arbitrary chain depth: .select().eq().eq().order().limit().single()
   */
  const chainable = (
    data: unknown = null,
    error: unknown = null,
  ): Record<string, jest.Mock> => {
    const mock: Record<string, jest.Mock> = {};
    const _self = () => mock;
    [
      'select',
      'eq',
      'neq',
      'lt',
      'gt',
      'is',
      'in',
      'not',
      'order',
      'limit',
      'insert',
      'update',
      'upsert',
      'delete',
      'maybeSingle',
    ].forEach((m) => {
      mock[m] = jest.fn().mockReturnValue(mock);
    });
    mock.single = jest.fn().mockResolvedValue({ data, error });
    // Also make the mock itself "thenable" for chains that don't end with single()
    mock.then = jest
      .fn()
      .mockImplementation((resolve: (v: unknown) => void) =>
        resolve({ data, error }),
      );
    return mock;
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
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: RefundService,
          useValue: mockRefundService,
        },
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
      ],
    }).compile();

    service = module.get<StripeWebhookService>(StripeWebhookService);
    _stripeService = module.get<StripeService>(StripeService);
    _supabaseService = module.get<SupabaseService>(SupabaseService);
    _customersService = module.get<CustomersService>(CustomersService);
    _subscriptionsService =
      module.get<SubscriptionsService>(SubscriptionsService);

    // Reset all mocks
    jest.clearAllMocks();
    // Re-set defaults after clearAllMocks
    mockRedisService.setIdempotencyKey.mockResolvedValue(true);
    mockStripeService.getClient.mockReturnValue(mockStripeClient);
  });

  // ─── Existing tests: handlePaymentIntentSucceeded ───────────────────────────

  describe('handlePaymentIntentSucceeded', () => {
    it('should create subscription after successful payment', async () => {
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
        metadata: {},
      };

      const mockCustomer = {
        id: 'customer_123',
        organization_id: 'org_123',
        stripe_customer_id: 'cus_test123',
      };

      const mockOrganization = {
        accounts: { stripe_id: 'acct_test123' },
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

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'payment_intents') {
          return chainable(mockPaymentIntentRecord);
        }
        if (table === 'checkout_sessions') {
          return chainable(null);
        }
        if (table === 'customers') {
          return chainable(mockCustomer);
        }
        if (table === 'organizations') {
          return chainable(mockOrganization);
        }
        if (table === 'product_prices') {
          return chainable(mockPrice);
        }
        if (table === 'subscriptions') {
          // insert().select().single() returns subscription; select().eq()... returns null (no existing)
          const c = chainable(mockSubscription);
          return c;
        }
        if (table === 'product_features') {
          return chainable([
            { feature_id: 'feat_1', config: { limit: 1000 } },
            { feature_id: 'feat_2', config: { enabled: true } },
          ]);
        }
        if (table === 'feature_grants') {
          return chainable([]);
        }
        return chainable(null);
      });

      mockStripeService.attachPaymentMethodToCustomer.mockResolvedValue({
        id: 'pm_test123',
      });
      mockStripeService.updateCustomer.mockResolvedValue({
        id: 'cus_test123',
      });
      mockStripeService.createSubscription.mockResolvedValue(
        mockStripeSubscription,
      );

      await service['handlePaymentIntentSucceeded'](
        paymentIntent as Stripe.PaymentIntent,
      );

      // Verify subscription-related tables were accessed
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('subscriptions');
    });

    it('should handle customer upsert race condition with retry', async () => {
      const paymentIntent: Partial<Stripe.PaymentIntent> = {
        id: 'pi_test123',
        customer: 'cus_test123',
        status: 'succeeded',
        metadata: {
          organizationId: 'org_123',
          externalUserId: 'ext_user_123',
          productId: 'prod_123',
          priceId: 'price_123',
        },
      };

      const mockPaymentIntentRecord = {
        id: 'pi_record_123',
        customer_id: null,
        metadata: {},
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'payment_intents') {
          return chainable(mockPaymentIntentRecord);
        }
        if (table === 'checkout_sessions') {
          return chainable(null);
        }
        if (table === 'customers') {
          return chainable({
            id: 'customer_123',
            organization_id: 'org_123',
          });
        }
        if (table === 'organizations') {
          return chainable({
            accounts: { stripe_id: 'acct_test123' },
          });
        }
        return chainable(null);
      });

      await service['handlePaymentIntentSucceeded'](
        paymentIntent as Stripe.PaymentIntent,
      );

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

      mockSupabaseClient.from.mockImplementation((table: string) => {
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

      await service['handlePaymentIntentSucceeded'](
        paymentIntent as Stripe.PaymentIntent,
      );

      expect(mockStripeService.createSubscription).not.toHaveBeenCalled();
    });

    it('should handle missing metadata gracefully', async () => {
      const paymentIntent: Partial<Stripe.PaymentIntent> = {
        id: 'pi_test123',
        customer: 'cus_test123',
        status: 'succeeded',
        metadata: {},
      };

      const mockPaymentIntentRecord = {
        id: 'pi_record_123',
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
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
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      });

      await service['handlePaymentIntentSucceeded'](
        paymentIntent as Stripe.PaymentIntent,
      );

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
          externalUserId: 'ext_user_123',
          productId: 'prod_123',
          priceId: 'price_123',
        },
      };

      const mockStripeSubscription = {
        id: 'sub_test123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'payment_intents') {
          return chainable({
            id: 'pi_record_123',
            customer_id: 'customer_123',
            metadata: {},
          });
        }
        if (table === 'checkout_sessions') {
          return chainable(null);
        }
        if (table === 'customers') {
          return chainable({
            id: 'customer_123',
            organization_id: 'org_123',
          });
        }
        if (table === 'organizations') {
          return chainable({
            accounts: { stripe_id: 'acct_test' },
          });
        }
        if (table === 'product_prices') {
          return chainable({
            stripe_price_id: 'price_test',
            price_amount: 1000,
            price_currency: 'usd',
          });
        }
        if (table === 'subscriptions') {
          // Return error for insert (DB failure), null for select (no existing sub)
          return chainable(null, { message: 'Database error' });
        }
        return chainable(null);
      });

      mockStripeService.createSubscription.mockResolvedValue(
        mockStripeSubscription,
      );

      await service['handlePaymentIntentSucceeded'](
        paymentIntent as Stripe.PaymentIntent,
      );

      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith(
        'sub_test123',
        expect.any(String),
      );
    });
  });

  // ─── FIX 1: handleInvoicePaymentFailed / handleInvoicePaymentSucceeded ──────

  describe('handleInvoicePaymentFailed (FIX 1)', () => {
    it('should update subscription to past_due and revoke features', async () => {
      const invoice = {
        id: 'in_test123',
        subscription: 'sub_stripe_123',
        attempt_count: 1,
      } as unknown as Stripe.Invoice;

      const mockPastDueSub = {
        id: 'sub_db_123',
        customer_id: 'cust_123',
        organization_id: 'org_123',
      };

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockPastDueSub,
              error: null,
            }),
          }),
        }),
      });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return { update: mockUpdate };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handleInvoicePaymentFailed'](invoice);

      // Subscription updated to past_due
      expect(mockUpdate).toHaveBeenCalledWith({ status: 'past_due' });

      // Features revoked
      expect(
        mockSubscriptionsService.revokeSubscriptionFeatures,
      ).toHaveBeenCalledWith('sub_db_123');

      // Notification sent to reconciliation queue
      expect(mockQueueService.sendReconciliation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment_failed_notification',
          reference_id: 'sub_db_123',
          details: expect.objectContaining({
            subscription_id: 'sub_db_123',
            customer_id: 'cust_123',
          }),
        }),
      );
    });

    it('should handle missing subscription gracefully', async () => {
      const invoice = {
        id: 'in_test123',
        subscription: 'sub_stripe_nonexistent',
      } as unknown as Stripe.Invoice;

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return { update: mockUpdate };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handleInvoicePaymentFailed'](invoice);

      // Features should NOT be revoked since subscription wasn't found
      expect(
        mockSubscriptionsService.revokeSubscriptionFeatures,
      ).not.toHaveBeenCalled();
    });

    it('should skip when no subscription on invoice', async () => {
      const invoice = {
        id: 'in_test123',
        // no subscription field
      } as unknown as Stripe.Invoice;

      await service['handleInvoicePaymentFailed'](invoice);

      expect(
        mockSubscriptionsService.revokeSubscriptionFeatures,
      ).not.toHaveBeenCalled();
      expect(mockQueueService.sendReconciliation).not.toHaveBeenCalled();
    });
  });

  describe('handleInvoicePaymentSucceeded (FIX 1)', () => {
    const makeInvoice = (subscription: string) =>
      ({ id: 'in_test123', subscription }) as unknown as Stripe.Invoice;

    it('should re-grant features when recovering from past_due', async () => {
      const invoice = makeInvoice('sub_stripe_123');

      const mockFullSub = {
        id: 'sub_db_123',
        customer_id: 'cust_123',
        product_id: 'prod_123',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };

      let selectCallCount = 0;
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          selectCallCount++;
          if (selectCallCount === 1) {
            // First call: check current status
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { status: 'past_due' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (selectCallCount === 2) {
            // Second call: get full sub for re-granting
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: mockFullSub,
                    error: null,
                  }),
                }),
              }),
            };
          }
          // Third call: update status to active
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handleInvoicePaymentSucceeded'](invoice);

      expect(
        mockSubscriptionsService.grantProductFeatures,
      ).toHaveBeenCalledWith(
        'cust_123',
        'sub_db_123',
        'prod_123',
        expect.any(Date),
        expect.any(Date),
      );
    });

    it('should NOT override trialing status to active', async () => {
      const invoice = makeInvoice('sub_stripe_123');

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { status: 'trialing' },
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handleInvoicePaymentSucceeded'](invoice);

      // grantProductFeatures should NOT be called for trialing
      expect(
        mockSubscriptionsService.grantProductFeatures,
      ).not.toHaveBeenCalled();
    });

    it('should NOT override already-active status', async () => {
      const invoice = makeInvoice('sub_stripe_123');

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { status: 'active' },
                  error: null,
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handleInvoicePaymentSucceeded'](invoice);

      // Update should NOT be called
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should return early when subscription not in DB', async () => {
      const invoice = makeInvoice('sub_stripe_gone');

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
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
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handleInvoicePaymentSucceeded'](invoice);

      expect(
        mockSubscriptionsService.grantProductFeatures,
      ).not.toHaveBeenCalled();
    });
  });

  // ─── FIX 2: Invoice→Subscription Resolution ─────────────────────────────────

  describe('handlePaymentIntentSucceeded — Invoice→Subscription Resolution (FIX 2)', () => {
    const makePI = (
      overrides: Partial<Stripe.PaymentIntent> = {},
    ): Stripe.PaymentIntent =>
      ({
        id: 'pi_fix2',
        customer: 'cus_fix2',
        status: 'succeeded',
        metadata: {
          organizationId: 'org_123',
          productId: 'prod_123',
          priceId: 'price_123',
        },
        ...overrides,
      }) as Stripe.PaymentIntent;

    const setupPIRecord = (extra: Record<string, unknown> = {}) => {
      const record = {
        id: 'pi_rec_fix2',
        customer_id: 'cust_123',
        stripe_account_id: 'acct_123',
        metadata: {},
        ...extra,
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'payment_intents') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: record,
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
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'cs_1', metadata: {} },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'sub_db_1', status: 'incomplete' },
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'sub_db_1' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'product_features') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }

        if (table === 'feature_grants') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }

        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      });

      return record;
    };

    it('should resolve invoice→subscription and route to direct flow', async () => {
      setupPIRecord();

      // PI has an invoice
      const pi = makePI({ invoice: 'in_123' } as Partial<Stripe.PaymentIntent>);

      // Invoice retrieve returns a subscription
      mockStripeClient.invoices.retrieve.mockResolvedValue({
        id: 'in_123',
        subscription: 'sub_stripe_resolved',
      });

      await service['handlePaymentIntentSucceeded'](pi);

      expect(mockStripeClient.invoices.retrieve).toHaveBeenCalledWith(
        'in_123',
        expect.objectContaining({ stripeAccount: 'acct_123' }),
      );
    });

    it('should fall back to legacy flow when no invoice on PaymentIntent', async () => {
      setupPIRecord();

      const pi = makePI(); // no invoice field

      await service['handlePaymentIntentSucceeded'](pi);

      // Should NOT try to retrieve an invoice
      expect(mockStripeClient.invoices.retrieve).not.toHaveBeenCalled();
    });

    it('should handle invoice retrieval failure gracefully', async () => {
      setupPIRecord();

      const pi = makePI({
        invoice: 'in_broken',
      } as Partial<Stripe.PaymentIntent>);

      mockStripeClient.invoices.retrieve.mockRejectedValue(
        new Error('Stripe API error'),
      );

      // Should not throw — falls back to legacy flow
      await expect(
        service['handlePaymentIntentSucceeded'](pi),
      ).resolves.not.toThrow();
    });
  });

  // ─── FIX 5: handleSubscriptionUpdated — incomplete_expired ──────────────────

  describe('handleSubscriptionUpdated — incomplete_expired (FIX 5)', () => {
    it('should revoke features and set ended_at for incomplete_expired', async () => {
      const subscription = {
        id: 'sub_stripe_ie',
        status: 'incomplete_expired',
        cancel_at_period_end: false,
      } as unknown as Stripe.Subscription;

      const mockExisting = {
        id: 'sub_db_ie',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };

      const mockUpdateFn = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      let selectCallCount = 0;
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          selectCallCount++;
          if (selectCallCount <= 1) {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: mockExisting,
                    error: null,
                  }),
                }),
              }),
              update: mockUpdateFn,
            };
          }
          // Second select: get product_id for cache invalidation
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { product_id: 'prod_ie' },
                  error: null,
                }),
              }),
            }),
            update: mockUpdateFn,
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handleSubscriptionUpdated'](subscription);

      // Should update status to incomplete_expired with ended_at
      expect(mockUpdateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'incomplete_expired',
          ended_at: expect.any(String),
        }),
      );

      // Should revoke features
      expect(
        mockSubscriptionsService.revokeSubscriptionFeatures,
      ).toHaveBeenCalledWith('sub_db_ie');
    });

    it('should invalidate cache for product metrics', async () => {
      const subscription = {
        id: 'sub_stripe_ie2',
        status: 'incomplete_expired',
        cancel_at_period_end: false,
      } as unknown as Stripe.Subscription;

      // Use a single chainable mock that returns both sub data and product_id
      // The code calls from('subscriptions') multiple times:
      // 1. select('id, current_period_start...').eq('stripe_subscription_id').single() → existing sub
      // 2. update({status, ended_at}).eq('id') → void
      // 3. select('product_id').eq('id').single() → { product_id }
      // With chainable, single() always returns the same value.
      // We need it to return product_id for the last call, so include it.
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return chainable({
            id: 'sub_db_ie2',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            product_id: 'prod_cache',
          });
        }
        return chainable(null);
      });

      await service['handleSubscriptionUpdated'](subscription);

      expect(mockCacheManager.del).toHaveBeenCalledWith(
        'product-metrics:prod_cache',
      );
    });

    it('should return early and NOT fetch fresh Stripe state for incomplete_expired', async () => {
      const subscription = {
        id: 'sub_stripe_ie3',
        status: 'incomplete_expired',
        cancel_at_period_end: false,
      } as unknown as Stripe.Subscription;

      const mockExisting = {
        id: 'sub_db_ie3',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockExisting,
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handleSubscriptionUpdated'](subscription);

      // Should NOT call Stripe API to fetch fresh state
      expect(mockStripeClient.subscriptions.retrieve).not.toHaveBeenCalled();
    });
  });

  // ─── FIX 9: Fresh Stripe State Fetch ────────────────────────────────────────

  describe('handleSubscriptionUpdated — Fresh Stripe State (FIX 9)', () => {
    it('should use fresh Stripe state over stale webhook payload', async () => {
      const subscription = {
        id: 'sub_stripe_stale',
        status: 'active', // webhook says active
        cancel_at_period_end: false,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      } as unknown as Stripe.Subscription;

      const mockExisting = {
        id: 'sub_db_fresh',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };

      // Stripe returns canceled (fresher state)
      mockStripeClient.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe_stale',
        status: 'canceled', // Stripe says canceled now
        cancel_at_period_end: true,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      });

      const mockUpdateFn = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      let selectCallCount = 0;
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          selectCallCount++;
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data:
                    selectCallCount <= 1
                      ? mockExisting
                      : { product_id: 'prod_fresh' },
                  error: null,
                }),
              }),
            }),
            update: mockUpdateFn,
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handleSubscriptionUpdated'](subscription);

      // Should update with the FRESH Stripe state (canceled), not the webhook state (active)
      expect(mockUpdateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'canceled',
          cancel_at_period_end: true,
        }),
      );
    });

    it('should fall back to webhook state when Stripe fetch fails', async () => {
      const subscription = {
        id: 'sub_stripe_fallback',
        status: 'active',
        cancel_at_period_end: false,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      } as unknown as Stripe.Subscription;

      const mockExisting = {
        id: 'sub_db_fallback',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };

      // Stripe API fails
      mockStripeClient.subscriptions.retrieve.mockRejectedValue(
        new Error('Stripe timeout'),
      );

      const mockUpdateFn = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      let selectCallCount = 0;
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          selectCallCount++;
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data:
                    selectCallCount <= 1
                      ? mockExisting
                      : { product_id: 'prod_fallback' },
                  error: null,
                }),
              }),
            }),
            update: mockUpdateFn,
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handleSubscriptionUpdated'](subscription);

      // Should still update using the webhook payload state
      expect(mockUpdateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
        }),
      );
    });
  });

  // ─── FIX 10: handleUpgradeDowngrade ─────────────────────────────────────────

  describe('handleUpgradeDowngrade (FIX 10)', () => {
    it('should cancel old Stripe sub, update DB, and revoke features', async () => {
      const mockExistingSub = {
        id: 'sub_old_db',
        stripe_subscription_id: 'sub_old_stripe',
        status: 'active',
        metadata: { plan: 'basic' },
      };

      const mockUpdateFn = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockExistingSub,
                  error: null,
                }),
              }),
            }),
            update: mockUpdateFn,
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handleUpgradeDowngrade'](
        mockSupabaseClient as any,
        'sub_old_db',
        'acct_test',
        'cs_new',
      );

      // Should cancel on Stripe
      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith(
        'sub_old_stripe',
        'acct_test',
        false,
      );

      // Should update DB
      expect(mockUpdateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'canceled',
          cancel_at_period_end: false,
          metadata: expect.objectContaining({
            canceledReason: 'upgraded_or_downgraded',
          }),
        }),
      );

      // Should revoke features immediately
      expect(
        mockSubscriptionsService.revokeSubscriptionFeatures,
      ).toHaveBeenCalledWith('sub_old_db');
    });

    it('should still revoke features even if Stripe cancel fails', async () => {
      const mockExistingSub = {
        id: 'sub_old_db2',
        stripe_subscription_id: 'sub_old_stripe2',
        status: 'active',
        metadata: {},
      };

      mockStripeService.cancelSubscription.mockRejectedValue(
        new Error('Stripe error'),
      );

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockExistingSub,
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      await service['handleUpgradeDowngrade'](
        mockSupabaseClient as any,
        'sub_old_db2',
        'acct_test',
      );

      // Revoke features should still be called
      expect(
        mockSubscriptionsService.revokeSubscriptionFeatures,
      ).toHaveBeenCalledWith('sub_old_db2');
    });

    it('should handle missing existing subscription gracefully', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
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
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      });

      // Should not throw
      await expect(
        service['handleUpgradeDowngrade'](
          mockSupabaseClient as any,
          'sub_nonexistent',
          'acct_test',
        ),
      ).resolves.not.toThrow();

      expect(mockStripeService.cancelSubscription).not.toHaveBeenCalled();
      expect(
        mockSubscriptionsService.revokeSubscriptionFeatures,
      ).not.toHaveBeenCalled();
    });
  });
});
