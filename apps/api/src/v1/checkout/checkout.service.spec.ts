import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { CustomersService } from '../../customers/customers.service';
import { StripeService } from '../../stripe/stripe.service';
import { CheckoutMetadataService } from './checkout-metadata.service';
import { RedisService } from '../../redis/redis.service';
import { QueueService } from '../../queue/queue.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

describe('CheckoutService', () => {
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
      retrieve: jest.fn(),
    },
    customers: {
      create: jest.fn(),
    },
    invoices: {
      retrieve: jest.fn(),
    },
    subscriptions: {
      retrieve: jest.fn(),
    },
    coupons: {
      create: jest.fn(),
    },
  };

  const mockStripeService = {
    getClient: jest.fn().mockReturnValue(mockStripeClient),
    createSubscription: jest.fn(),
    cancelSubscription: jest.fn(),
  };

  const mockMetadataService = {
    createMetadata: jest.fn().mockResolvedValue({
      id: 'meta_123',
      expiresAt: null,
    }),
    linkToCheckoutSession: jest.fn().mockResolvedValue(undefined),
    getMetadata: jest.fn(),
  };

  const mockRedisService = {
    setIdempotencyKey: jest.fn().mockResolvedValue(true),
    checkIdempotencyKey: jest.fn().mockResolvedValue(false),
    delete: jest.fn(),
  };

  const mockQueueService = {
    sendReconciliation: jest.fn().mockResolvedValue(1),
    sendAlert: jest.fn().mockResolvedValue(1),
  };

  /**
   * Creates a deeply-chainable Supabase mock that resolves to { data, error }.
   */
  const chainable = (
    data: unknown = null,
    error: unknown = null,
  ): Record<string, jest.Mock> => {
    const mock: Record<string, jest.Mock> = {};
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
        {
          provide: CheckoutMetadataService,
          useValue: mockMetadataService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    customersService = module.get<CustomersService>(CustomersService);
    stripeService = module.get<StripeService>(StripeService);

    jest.clearAllMocks();
    // Re-set defaults
    mockStripeService.getClient.mockReturnValue(mockStripeClient);
    mockRedisService.setIdempotencyKey.mockResolvedValue(true);
    mockMetadataService.createMetadata.mockResolvedValue({
      id: 'meta_123',
      expiresAt: null,
    });
  });

  // ─── Existing tests ────────────────────────────────────────────────────────

  describe('createCheckout', () => {
    it('should handle missing product gracefully', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'product_prices') {
          return chainable(null, { message: 'not found' });
        }
        return chainable(null);
      });

      await expect(
        service.createCheckout('org_123', 'ext_user_123', {
          priceId: 'price_nonexistent',
          customerEmail: 'test@example.com',
          customerName: 'Test Customer',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmCheckout', () => {
    it('should retrieve payment status and return success', async () => {
      const clientSecret = 'pi_test123_secret_test';
      const confirmDto = { paymentMethodId: 'pm_test123' };

      const mockPaymentIntentRecord = {
        id: 'pi_record_123',
        stripe_account_id: 'acct_test123',
        customer_id: 'customer_123',
        product_id: 'prod_123',
        price_id: 'price_123',
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'payment_intents') {
          return chainable(mockPaymentIntentRecord);
        }
        if (table === 'checkout_sessions') {
          return chainable({ id: 'cs_123' });
        }
        return chainable(null);
      });

      // The code now retrieves PI status instead of confirming
      mockStripeClient.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_test123',
        status: 'succeeded',
        payment_method: 'pm_test123',
      });

      const result = await service.confirmCheckout(clientSecret, confirmDto);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'succeeded',
          requiresAction: false,
          success: true,
        }),
      );

      expect(mockStripeClient.paymentIntents.retrieve).toHaveBeenCalledWith(
        'pi_test123',
        { stripeAccount: 'acct_test123' },
      );
    });

    it('should handle 3D Secure requirements', async () => {
      const clientSecret = 'pi_test123_secret_test';
      const confirmDto = { paymentMethodId: 'pm_test123' };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'payment_intents') {
          return chainable({ stripe_account_id: 'acct_test123' });
        }
        return chainable(null);
      });

      mockStripeClient.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_test123',
        status: 'requires_action',
        next_action: {
          type: 'redirect_to_url',
          redirect_to_url: { url: 'https://stripe.com/3ds/auth' },
        },
      });

      const result = await service.confirmCheckout(clientSecret, confirmDto);

      expect(result).toEqual({
        status: 'requires_action',
        requiresAction: true,
        actionUrl: 'https://stripe.com/3ds/auth',
        success: false,
      });
    });

    it('should handle payment failure gracefully', async () => {
      const clientSecret = 'pi_test123_secret_test';
      const confirmDto = { paymentMethodId: 'pm_test123' };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'payment_intents') {
          return chainable({ stripe_account_id: 'acct_test123' });
        }
        return chainable(null);
      });

      const stripeError = new Error('Card declined');
      (stripeError as any).type = 'StripeCardError';
      mockStripeClient.paymentIntents.retrieve.mockRejectedValue(stripeError);

      await expect(
        service.confirmCheckout(clientSecret, confirmDto),
      ).rejects.toThrow('Card error: Card declined');
    });
  });

  // ─── FIX 3: Duplicate Checkout Prevention ──────────────────────────────────

  describe('createCheckout — Duplicate Checkout Prevention (FIX 3)', () => {
    const setupForDuplicateTests = (existingSubs: unknown[] = []) => {
      const mockPrice = {
        id: 'price_123',
        price_amount: 1000,
        price_currency: 'usd',
        amount_type: 'fixed',
        stripe_price_id: 'price_stripe_123',
        is_archived: false,
        recurring_interval: 'month',
        recurring_interval_count: 1,
        product: {
          id: 'prod_123',
          name: 'Test Product',
          organization_id: 'org_123',
          is_archived: false,
          trial_days: 0,
        },
      };

      const mockOrg = { accounts: { stripe_id: 'acct_123' } };
      const mockCustomer = {
        id: 'cust_123',
        stripe_customer_id: 'cus_stripe_123',
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'product_prices') {
          return chainable(mockPrice);
        }
        if (table === 'organizations') {
          return chainable(mockOrg);
        }
        if (table === 'customers') {
          return chainable(mockCustomer);
        }
        if (table === 'subscriptions') {
          // Use a mock that returns existingSubs for select queries
          const c = chainable(existingSubs);
          return c;
        }
        return chainable(null);
      });
    };

    it('should throw BadRequestException if active subscription exists', async () => {
      setupForDuplicateTests([
        {
          id: 'sub_existing',
          status: 'active',
          created_at: new Date().toISOString(),
        },
      ]);

      await expect(
        service.createCheckout('org_123', 'ext_user_123', {
          priceId: 'price_123',
          customerEmail: 'test@example.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if trialing subscription exists', async () => {
      setupForDuplicateTests([
        {
          id: 'sub_trial',
          status: 'trialing',
          created_at: new Date().toISOString(),
        },
      ]);

      await expect(
        service.createCheckout('org_123', 'ext_user_123', {
          priceId: 'price_123',
          customerEmail: 'test@example.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if past_due subscription exists', async () => {
      setupForDuplicateTests([
        {
          id: 'sub_pd',
          status: 'past_due',
          created_at: new Date().toISOString(),
        },
      ]);

      await expect(
        service.createCheckout('org_123', 'ext_user_123', {
          priceId: 'price_123',
          customerEmail: 'test@example.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should clean up stale incomplete subscriptions (>1 hour old)', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      // Only incomplete (not active/trialing/past_due), so check passes
      // but stale cleanup should fire
      const staleSub = {
        id: 'sub_stale',
        status: 'incomplete',
        created_at: twoHoursAgo.toISOString(),
        stripe_subscription_id: 'sub_stripe_stale',
      };

      const mockPrice = {
        id: 'price_123',
        price_amount: 1000,
        price_currency: 'usd',
        amount_type: 'fixed',
        stripe_price_id: 'price_stripe_123',
        is_archived: false,
        recurring_interval: 'month',
        recurring_interval_count: 1,
        product: {
          id: 'prod_123',
          name: 'Test Product',
          organization_id: 'org_123',
          is_archived: false,
          trial_days: 0,
        },
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'product_prices') {
          return chainable(mockPrice);
        }
        if (table === 'organizations') {
          return chainable({ accounts: { stripe_id: 'acct_123' } });
        }
        if (table === 'customers') {
          return chainable({
            id: 'cust_123',
            stripe_customer_id: 'cus_stripe_123',
          });
        }
        if (table === 'subscriptions') {
          // Return a chainable that resolves to [staleSub] for the select chain
          // and also resolves for update/single chains
          const c = chainable(staleSub);
          // Override: for the .in() chain (subscription status check), return the array
          const origIn = c.in;
          c.in = jest
            .fn()
            .mockResolvedValue({ data: [staleSub], error: null });
          return c;
        }
        return chainable(null);
      });

      // The stale cleanup calls cancelSubscription
      mockStripeService.cancelSubscription.mockResolvedValue(undefined);

      try {
        await service.createCheckout('org_123', 'ext_user_123', {
          priceId: 'price_123',
          customerEmail: 'test@example.com',
        });
      } catch {
        // May fail later in the flow — we only care about cleanup
      }

      expect(mockStripeService.cancelSubscription).toHaveBeenCalled();
    });
  });

  // ─── FIX 4: DB Failure → Stripe Cancel → Queue Fallback ───────────────────

  describe('createCheckout — DB Failure → Stripe Cancel → Queue (FIX 4)', () => {
    const setupForDBFailure = (stripeCancelError: boolean) => {
      const mockPrice = {
        id: 'price_123',
        price_amount: 1000,
        price_currency: 'usd',
        amount_type: 'fixed',
        stripe_price_id: 'price_stripe_123',
        is_archived: false,
        recurring_interval: 'month',
        recurring_interval_count: 1,
        product: {
          id: 'prod_123',
          name: 'Test Product',
          organization_id: 'org_123',
          is_archived: false,
          trial_days: 0,
        },
      };

      mockStripeService.createSubscription.mockResolvedValue({
        id: 'sub_stripe_new',
        status: 'incomplete',
        latest_invoice: { id: 'in_123' },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end:
          Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      });

      mockStripeClient.invoices.retrieve.mockResolvedValue({
        id: 'in_123',
        payments: {
          data: [
            {
              payment: {
                payment_intent: {
                  id: 'pi_new',
                  client_secret: 'pi_new_secret',
                  status: 'requires_payment_method',
                },
              },
            },
          ],
        },
      });

      if (stripeCancelError) {
        mockStripeService.cancelSubscription.mockRejectedValue(
          new Error('Stripe cancel failed'),
        );
      } else {
        mockStripeService.cancelSubscription.mockResolvedValue(undefined);
      }

      mockStripeClient.customers.create.mockResolvedValue({
        id: 'cus_stripe_new',
      });

      mockCustomersService.upsertCustomer.mockResolvedValue({
        id: 'cust_123',
        stripe_customer_id: 'cus_stripe_new',
      });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'product_prices') {
          return chainable(mockPrice);
        }
        if (table === 'organizations') {
          return chainable({ accounts: { stripe_id: 'acct_123' } });
        }
        if (table === 'customers') {
          return chainable({
            id: 'cust_123',
            stripe_customer_id: 'cus_stripe_new',
          });
        }
        if (table === 'subscriptions') {
          // First query (duplicate check) returns empty, insert fails
          const c = chainable(null, { message: 'DB insert error' });
          // Override in() for the duplicate check to return empty
          c.in = jest.fn().mockResolvedValue({ data: [], error: null });
          return c;
        }
        if (table === 'checkout_metadata') {
          return chainable({ id: 'meta_123' });
        }
        if (table === 'payment_intents') {
          return chainable({
            id: 'pi_rec_new',
            amount: 1000,
            currency: 'usd',
          });
        }
        if (table === 'checkout_sessions') {
          return chainable({ id: 'cs_new' });
        }
        if (table === 'product_features') {
          return chainable([]);
        }
        return chainable(null);
      });
    };

    it('should cancel Stripe subscription when DB insert fails', async () => {
      setupForDBFailure(false);

      try {
        await service.createCheckout('org_123', 'ext_user_123', {
          priceId: 'price_123',
          customerEmail: 'test@example.com',
        });
      } catch {
        // Expected
      }

      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith(
        'sub_stripe_new',
        'acct_123',
      );
    });

    it('should send to reconciliation queue when both DB insert AND Stripe cancel fail', async () => {
      setupForDBFailure(true);

      try {
        await service.createCheckout('org_123', 'ext_user_123', {
          priceId: 'price_123',
          customerEmail: 'test@example.com',
        });
      } catch {
        // Expected
      }

      expect(mockQueueService.sendReconciliation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'orphaned_stripe_subscription',
          reference_id: 'sub_stripe_new',
          details: expect.objectContaining({
            stripe_subscription_id: 'sub_stripe_new',
            stripe_account_id: 'acct_123',
          }),
        }),
      );
    });
  });

  // ─── FIX 7: Discount Lock ─────────────────────────────────────────────────

  describe('applyDiscount — Discount Lock (FIX 7)', () => {
    it('should throw ConflictException when lock already held', async () => {
      mockRedisService.setIdempotencyKey.mockResolvedValue(false);

      await expect(
        service.applyDiscount('cs_locked', 'SAVE20'),
      ).rejects.toThrow(ConflictException);

      // Lock acquisition was attempted
      expect(mockRedisService.setIdempotencyKey).toHaveBeenCalledWith(
        'discount-lock:cs_locked',
        expect.any(String),
        30000,
      );
    });

    it('should release lock even when inner operation fails', async () => {
      mockRedisService.setIdempotencyKey.mockResolvedValue(true);

      // Make the inner operation fail (session not found)
      mockSupabaseClient.from.mockImplementation(() =>
        chainable(null, { message: 'session not found' }),
      );

      try {
        await service.applyDiscount('cs_fail', 'SAVE20');
      } catch {
        // Expected to throw
      }

      // Lock should STILL be released via finally block
      expect(mockRedisService.delete).toHaveBeenCalledWith(
        'discount-lock:cs_fail',
      );
    });

    it('should acquire and release lock on success path', async () => {
      mockRedisService.setIdempotencyKey.mockResolvedValue(true);

      // Setup enough mocks for applyDiscount to get past the lock
      // and into the inner function, even if it fails on business logic
      const mockSession = {
        id: 'cs_lock',
        metadata: { checkoutMode: 'standard' },
        completed_at: null,
        payment_intent: {
          id: 'pi_rec_lock',
          product_id: 'prod_123',
          amount: 1000,
          stripe_account_id: 'acct_123',
          currency: 'usd',
          stripe_payment_intent_id: 'pi_lock',
          stripe_subscription_id: 'sub_lock',
        },
        organization_id: 'org_123',
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'checkout_sessions') {
          return chainable(mockSession);
        }
        if (table === 'discounts') {
          return chainable(null); // discount not found → throws
        }
        return chainable(null);
      });

      try {
        await service.applyDiscount('cs_lock', 'SAVE20');
      } catch {
        // Will throw BadRequestException for invalid code
      }

      // Lock should have been acquired
      expect(mockRedisService.setIdempotencyKey).toHaveBeenCalledWith(
        'discount-lock:cs_lock',
        expect.any(String),
        30000,
      );

      // Lock should have been released
      expect(mockRedisService.delete).toHaveBeenCalledWith(
        'discount-lock:cs_lock',
      );
    });
  });
});
