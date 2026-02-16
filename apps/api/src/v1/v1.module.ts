import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { FeaturesModule } from '../features/features.module';
import { SessionTokensModule } from '../session-tokens/session-tokens.module';
import { V1ProductsModule } from './products/products.module';
import { CheckoutModule } from './checkout/checkout.module';
import { PortalModule } from './portal/portal.module';
import { CustomerController } from './customer/customer.controller';
import { V1FeaturesController } from './features/features.controller';

/**
 * SDK API Module (v1)
 *
 * This module provides customer-facing API endpoints for the SDK.
 * Uses session token authentication instead of JWT.
 *
 * Routes:
 * - /v1/customer/*     Customer self-service endpoints
 * - /v1/products       Pricing table products
 * - /v1/checkout/*     Payment intent creation and processing
 * - /v1/portal/*       Customer portal session management
 * - /v1/subscriptions/* Customer subscription management
 * - /v1/features/*     Feature gating and usage tracking
 */
@Module({
  imports: [
    CustomersModule,
    SubscriptionsModule,
    FeaturesModule,
    SessionTokensModule,
    V1ProductsModule,
    CheckoutModule,
    PortalModule,
  ],
  controllers: [
    CustomerController,
    V1FeaturesController,
  ],
})
export class V1Module {}
