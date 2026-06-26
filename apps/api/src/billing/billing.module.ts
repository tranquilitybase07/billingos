import { Module, forwardRef } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { BillingCleanupService } from './billing-cleanup.service';
import { EntitlementService } from './entitlements/entitlement.service';
import { UsageService } from './entitlements/usage.service';
import { WebhookMiddleware } from './webhooks/webhook.middleware';
import { WebhookRouter } from './webhooks/webhook.router';

// Webhook handlers
import { SubscriptionCreatedHandler } from './webhooks/handlers/subscription-created.handler';
import { SubscriptionUpdatedHandler } from './webhooks/handlers/subscription-updated.handler';
import { SubscriptionDeletedHandler } from './webhooks/handlers/subscription-deleted.handler';
import { InvoicePaymentSucceededHandler } from './webhooks/handlers/invoice-payment-succeeded.handler';
import { InvoicePaymentFailedHandler } from './webhooks/handlers/invoice-payment-failed.handler';
import { CheckoutSessionCompletedHandler } from './webhooks/handlers/checkout-session-completed.handler';
import { PaymentIntentSucceededHandler } from './webhooks/handlers/payment-intent-succeeded.handler';
import { PaymentIntentFailedHandler } from './webhooks/handlers/payment-intent-failed.handler';
import { SetupIntentSucceededHandler } from './webhooks/handlers/setup-intent-succeeded.handler';
import { AccountUpdatedHandler } from './webhooks/handlers/account-updated.handler';
import { AccountDeauthorizedHandler } from './webhooks/handlers/account-deauthorized.handler';
import { IdentityVerificationHandler } from './webhooks/handlers/identity-verification.handler';
import { PayoutHandler } from './webhooks/handlers/payout.handler';
import { CustomerHandler } from './webhooks/handlers/customer.handler';
import { ChargeRefundedHandler } from './webhooks/handlers/charge-refunded.handler';
import { DisputeHandler } from './webhooks/handlers/dispute.handler';
import { EntitlementHandler } from './webhooks/handlers/entitlement.handler';
import { DiscountHandler } from './webhooks/handlers/discount.handler';

// Pipeline components
import { BillingService } from './billing.service';
import { BillingContextBuilder } from './context/billing-context.builder';
import { CustomerResolver } from './context/customer.resolver';
import { TransitionDetector } from './context/transition.detector';
import { BillingPlanBuilder } from './plan/billing-plan.builder';
import { EntitlementPlanner } from './plan/entitlement.planner';
import { ProrationCalculator } from './plan/proration.calculator';
import { StripePlanBuilder } from './stripe/stripe-plan.builder';
import { StripePlanExecutor } from './stripe/stripe-plan.executor';
import { ProrationInvoiceService } from './stripe/proration-invoice.service';
import { BosPlanExecutor } from './execute/bos-plan.executor';
import { EntitlementExecutor } from './execute/entitlement.executor';
import { CheckoutDiscountService } from './checkout/discount.service';

import { SupabaseModule } from '../supabase/supabase.module';
import { StripeModule } from '../stripe/stripe.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CustomersModule } from '../customers/customers.module';
import { CheckoutMetadataService } from '../v1/checkout/checkout-metadata.service';
import { QueueModule } from '../queue/queue.module';
import { RedisModule } from '../redis/redis.module';

const webhookHandlers = [
  SubscriptionCreatedHandler,
  SubscriptionUpdatedHandler,
  SubscriptionDeletedHandler,
  InvoicePaymentSucceededHandler,
  InvoicePaymentFailedHandler,
  CheckoutSessionCompletedHandler,
  PaymentIntentSucceededHandler,
  PaymentIntentFailedHandler,
  SetupIntentSucceededHandler,
  AccountUpdatedHandler,
  AccountDeauthorizedHandler,
  IdentityVerificationHandler,
  PayoutHandler,
  CustomerHandler,
  ChargeRefundedHandler,
  DisputeHandler,
  EntitlementHandler,
  DiscountHandler,
];

@Module({
  imports: [
    SupabaseModule,
    QueueModule,
    RedisModule,
    CustomersModule,
    CacheModule.register(),
    forwardRef(() => StripeModule),
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [
    BillingCleanupService,
    EntitlementService,
    UsageService,
    WebhookMiddleware,
    WebhookRouter,
    ...webhookHandlers,
    // Shared services
    CheckoutMetadataService,
    // Pipeline components
    BillingService,
    BillingContextBuilder,
    CustomerResolver,
    TransitionDetector,
    BillingPlanBuilder,
    EntitlementPlanner,
    ProrationCalculator,
    StripePlanBuilder,
    StripePlanExecutor,
    ProrationInvoiceService,
    BosPlanExecutor,
    EntitlementExecutor,
    // Discount service
    CheckoutDiscountService,
  ],
  exports: [
    EntitlementService,
    UsageService,
    WebhookMiddleware,
    WebhookRouter,
    BillingService,
    CheckoutDiscountService,
  ],
})
export class BillingModule {}
