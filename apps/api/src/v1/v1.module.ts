import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { FeaturesModule } from '../features/features.module';
import { SessionTokensModule } from '../session-tokens/session-tokens.module';
import { V1ProductsModule } from './products/products.module';
import { CustomerController } from './customer/customer.controller';

/**
 * SDK API Module (v1)
 *
 * This module provides customer-facing API endpoints for the SDK.
 * Uses session token authentication instead of JWT.
 *
 * Routes:
 * - /v1/customer/*     Customer self-service endpoints
 * - /v1/products       Pricing table products
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
  ],
  controllers: [
    CustomerController,
  ],
})
export class V1Module {}
