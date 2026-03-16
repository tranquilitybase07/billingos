import { Test, TestingModule } from '@nestjs/testing';
import { BillingCleanupService } from './billing-cleanup.service';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { QueueService, PgmqMessage } from '../queue/queue.service';

describe('BillingCleanupService', () => {
  let service: BillingCleanupService;

  const mockSupabaseClient = {
    from: jest.fn(),
  };

  const mockStripeService = {
    cancelSubscription: jest.fn(),
    listAccountSubscriptions: jest.fn(),
  };

  const mockSubscriptionsService = {
    revokeSubscriptionFeatures: jest.fn(),
  };

  const mockQueueService = {
    readReconciliation: jest.fn().mockResolvedValue([]),
    archiveReconciliation: jest.fn().mockResolvedValue(true),
    sendAlert: jest.fn().mockResolvedValue(1),
    sendReconciliation: jest.fn().mockResolvedValue(1),
    escalateToManualReview: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingCleanupService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn().mockReturnValue(mockSupabaseClient),
          },
        },
        {
          provide: StripeService,
          useValue: mockStripeService,
        },
        {
          provide: SubscriptionsService,
          useValue: mockSubscriptionsService,
        },
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
      ],
    }).compile();

    service = module.get<BillingCleanupService>(BillingCleanupService);

    jest.clearAllMocks();
  });

  // ─── Job A: cleanupExpiredCheckouts ────────────────────────────────────────

  describe('cleanupExpiredCheckouts (Job A)', () => {
    it('should cancel Stripe subscriptions for expired sessions', async () => {
      const expiredSessions = [
        {
          id: 'cs_expired_1',
          stripe_subscription_id: 'sub_expired_1',
          organization_id: 'org_1',
          metadata: { stripeAccountId: 'acct_1' },
        },
        {
          id: 'cs_expired_2',
          stripe_subscription_id: 'sub_expired_2',
          organization_id: 'org_1',
          metadata: { stripeAccountId: 'acct_1' },
        },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'checkout_sessions') {
          return {
            select: jest.fn().mockReturnValue({
              lt: jest.fn().mockReturnValue({
                is: jest.fn().mockReturnValue({
                  not: jest.fn().mockReturnValue({
                    order: jest.fn().mockReturnValue({
                      limit: jest.fn().mockResolvedValue({
                        data: expiredSessions,
                        error: null,
                      }),
                    }),
                  }),
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

      mockStripeService.cancelSubscription.mockResolvedValue(undefined);

      await service.cleanupExpiredCheckouts();

      expect(mockStripeService.cancelSubscription).toHaveBeenCalledTimes(2);
      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith(
        'sub_expired_1',
        'acct_1',
      );
      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith(
        'sub_expired_2',
        'acct_1',
      );
    });

    it('should skip sessions without stripe_subscription_id', async () => {
      const expiredSessions = [
        {
          id: 'cs_no_sub',
          stripe_subscription_id: null,
          organization_id: 'org_1',
          metadata: { stripeAccountId: 'acct_1' },
        },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'checkout_sessions') {
          return {
            select: jest.fn().mockReturnValue({
              lt: jest.fn().mockReturnValue({
                is: jest.fn().mockReturnValue({
                  not: jest.fn().mockReturnValue({
                    order: jest.fn().mockReturnValue({
                      limit: jest.fn().mockResolvedValue({
                        data: expiredSessions,
                        error: null,
                      }),
                    }),
                  }),
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

      await service.cleanupExpiredCheckouts();

      expect(mockStripeService.cancelSubscription).not.toHaveBeenCalled();
    });

    it('should handle Stripe cancel failure gracefully and continue processing', async () => {
      const expiredSessions = [
        {
          id: 'cs_fail',
          stripe_subscription_id: 'sub_fail',
          organization_id: 'org_1',
          metadata: { stripeAccountId: 'acct_1' },
        },
        {
          id: 'cs_ok',
          stripe_subscription_id: 'sub_ok',
          organization_id: 'org_1',
          metadata: { stripeAccountId: 'acct_1' },
        },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'checkout_sessions') {
          return {
            select: jest.fn().mockReturnValue({
              lt: jest.fn().mockReturnValue({
                is: jest.fn().mockReturnValue({
                  not: jest.fn().mockReturnValue({
                    order: jest.fn().mockReturnValue({
                      limit: jest.fn().mockResolvedValue({
                        data: expiredSessions,
                        error: null,
                      }),
                    }),
                  }),
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

      // First call fails, second succeeds
      mockStripeService.cancelSubscription
        .mockRejectedValueOnce(new Error('Stripe error'))
        .mockResolvedValueOnce(undefined);

      await service.cleanupExpiredCheckouts();

      // Both should be attempted
      expect(mockStripeService.cancelSubscription).toHaveBeenCalledTimes(2);
    });

    it('should do nothing when no expired sessions found', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'checkout_sessions') {
          return {
            select: jest.fn().mockReturnValue({
              lt: jest.fn().mockReturnValue({
                is: jest.fn().mockReturnValue({
                  not: jest.fn().mockReturnValue({
                    order: jest.fn().mockReturnValue({
                      limit: jest.fn().mockResolvedValue({
                        data: [],
                        error: null,
                      }),
                    }),
                  }),
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

      await service.cleanupExpiredCheckouts();

      expect(mockStripeService.cancelSubscription).not.toHaveBeenCalled();
    });

    it('should skip if already running (reentrancy guard)', async () => {
      // Simulate the flag being set
      (service as any).isProcessingCheckouts = true;

      mockSupabaseClient.from.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          lt: jest.fn().mockReturnValue({
            is: jest.fn().mockReturnValue({
              not: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'cs_1',
                        stripe_subscription_id: 'sub_1',
                        metadata: { stripeAccountId: 'acct_1' },
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }));

      await service.cleanupExpiredCheckouts();

      // Should not process anything because guard prevented it
      expect(mockStripeService.cancelSubscription).not.toHaveBeenCalled();

      // Clean up
      (service as any).isProcessingCheckouts = false;
    });
  });

  // ─── Job B: cleanupStaleIncompleteSubscriptions ───────────────────────────

  describe('cleanupStaleIncompleteSubscriptions (Job B)', () => {
    it('should cancel and revoke features for >24h incomplete subscriptions', async () => {
      const staleSubs = [
        {
          id: 'sub_db_stale_1',
          stripe_subscription_id: 'sub_stripe_stale_1',
          organization_id: 'org_1',
        },
      ];

      const mockOrg = {
        accounts: { stripe_id: 'acct_1' },
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                lt: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue({
                      data: staleSubs,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }

        if (table === 'organizations') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockOrg,
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

      mockStripeService.cancelSubscription.mockResolvedValue(undefined);

      await service.cleanupStaleIncompleteSubscriptions();

      // Should cancel on Stripe
      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith(
        'sub_stripe_stale_1',
        'acct_1',
      );

      // Should revoke features
      expect(
        mockSubscriptionsService.revokeSubscriptionFeatures,
      ).toHaveBeenCalledWith('sub_db_stale_1');
    });

    it('should handle subscription without stripe_subscription_id', async () => {
      const staleSubs = [
        {
          id: 'sub_db_no_stripe',
          stripe_subscription_id: null,
          organization_id: 'org_1',
        },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                lt: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue({
                      data: staleSubs,
                      error: null,
                    }),
                  }),
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

      await service.cleanupStaleIncompleteSubscriptions();

      // Should NOT try to cancel on Stripe (no ID)
      expect(mockStripeService.cancelSubscription).not.toHaveBeenCalled();

      // Should still revoke features and update DB status
      expect(
        mockSubscriptionsService.revokeSubscriptionFeatures,
      ).toHaveBeenCalledWith('sub_db_no_stripe');
    });

    it('should skip if already running', async () => {
      (service as any).isProcessingIncomplete = true;

      await service.cleanupStaleIncompleteSubscriptions();

      expect(mockStripeService.cancelSubscription).not.toHaveBeenCalled();
      expect(
        mockSubscriptionsService.revokeSubscriptionFeatures,
      ).not.toHaveBeenCalled();

      (service as any).isProcessingIncomplete = false;
    });
  });

  // ─── Job D: processReconciliationQueue ────────────────────────────────────

  describe('processReconciliationQueue (Job D)', () => {
    const makePgmqMsg = (
      overrides: Partial<PgmqMessage> & { message: PgmqMessage['message'] },
    ): PgmqMessage => ({
      msg_id: 1,
      read_ct: 1,
      enqueued_at: new Date().toISOString(),
      vt: new Date(Date.now() + 300000).toISOString(),
      ...overrides,
    });

    it('should process orphaned_stripe_subscription by canceling on Stripe and archiving', async () => {
      const msg = makePgmqMsg({
        msg_id: 10,
        read_ct: 1,
        message: {
          type: 'orphaned_stripe_subscription',
          reference_id: 'sub_orphan',
          priority: 2,
          details: {
            stripe_subscription_id: 'sub_stripe_orphan',
            stripe_account_id: 'acct_orphan',
          },
          created_by: 'checkout.service',
        },
      });

      mockQueueService.readReconciliation.mockResolvedValue([msg]);
      mockStripeService.cancelSubscription.mockResolvedValue(undefined);

      await service.processReconciliationQueue();

      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith(
        'sub_stripe_orphan',
        'acct_orphan',
      );

      expect(mockQueueService.archiveReconciliation).toHaveBeenCalledWith(10);
    });

    it('should process payment_failed_notification (archive only)', async () => {
      const msg = makePgmqMsg({
        msg_id: 20,
        read_ct: 1,
        message: {
          type: 'payment_failed_notification',
          reference_id: 'sub_failed',
          priority: 3,
          details: {
            subscription_id: 'sub_failed',
            attempt_count: 2,
          },
          created_by: 'stripe-webhook.service',
        },
      });

      mockQueueService.readReconciliation.mockResolvedValue([msg]);

      await service.processReconciliationQueue();

      // Should archive (no Stripe action needed for notifications)
      expect(mockQueueService.archiveReconciliation).toHaveBeenCalledWith(20);

      // Should NOT cancel anything on Stripe
      expect(mockStripeService.cancelSubscription).not.toHaveBeenCalled();
    });

    it('should escalate after 5 retries (read_ct > 5)', async () => {
      const msg = makePgmqMsg({
        msg_id: 30,
        read_ct: 6,
        message: {
          type: 'orphaned_stripe_subscription',
          reference_id: 'sub_stuck',
          priority: 2,
          details: {
            stripe_subscription_id: 'sub_stripe_stuck',
            stripe_account_id: 'acct_stuck',
          },
          created_by: 'checkout.service',
        },
      });

      mockQueueService.readReconciliation.mockResolvedValue([msg]);

      await service.processReconciliationQueue();

      // Should escalate to manual review, NOT process normally
      expect(mockQueueService.escalateToManualReview).toHaveBeenCalledWith(
        msg,
        expect.stringContaining('Max retries exceeded'),
      );

      // Should NOT try to cancel the subscription
      expect(mockStripeService.cancelSubscription).not.toHaveBeenCalled();

      // Should NOT archive (escalation handles that)
      expect(mockQueueService.archiveReconciliation).not.toHaveBeenCalledWith(
        30,
      );
    });

    it('should handle empty queue', async () => {
      mockQueueService.readReconciliation.mockResolvedValue([]);

      await service.processReconciliationQueue();

      expect(mockStripeService.cancelSubscription).not.toHaveBeenCalled();
      expect(mockQueueService.archiveReconciliation).not.toHaveBeenCalled();
      expect(
        mockQueueService.escalateToManualReview,
      ).not.toHaveBeenCalled();
    });

    it('should skip if already running', async () => {
      (service as any).isProcessingReconciliation = true;

      mockQueueService.readReconciliation.mockResolvedValue([
        makePgmqMsg({
          message: {
            type: 'orphaned_stripe_subscription',
            reference_id: 'sub_skip',
            priority: 2,
            details: {},
            created_by: 'test',
          },
        }),
      ]);

      await service.processReconciliationQueue();

      // Should not read from queue
      expect(mockQueueService.readReconciliation).not.toHaveBeenCalled();

      (service as any).isProcessingReconciliation = false;
    });

    it('should handle processing failure gracefully (message auto-retries via VT)', async () => {
      const msg = makePgmqMsg({
        msg_id: 40,
        read_ct: 2,
        message: {
          type: 'orphaned_stripe_subscription',
          reference_id: 'sub_err',
          priority: 2,
          details: {
            stripe_subscription_id: 'sub_stripe_err',
            stripe_account_id: 'acct_err',
          },
          created_by: 'checkout.service',
        },
      });

      mockQueueService.readReconciliation.mockResolvedValue([msg]);
      mockStripeService.cancelSubscription.mockRejectedValue(
        new Error('Stripe down'),
      );

      // Should not throw — error is caught and message becomes visible after VT expires
      await expect(
        service.processReconciliationQueue(),
      ).resolves.not.toThrow();

      // Should NOT archive the failed message
      expect(mockQueueService.archiveReconciliation).not.toHaveBeenCalledWith(
        40,
      );
    });
  });
});
