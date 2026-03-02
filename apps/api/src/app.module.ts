import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import * as redisStore from 'cache-manager-redis-store';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { SupabaseModule } from './supabase/supabase.module';
import { UserModule } from './user/user.module';
import { StripeModule } from './stripe/stripe.module';
import { OrganizationModule } from './organization/organization.module';
import { AccountModule } from './account/account.module';
import { ProductsModule } from './products/products.module';
import { FeaturesModule } from './features/features.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { DiscountsModule } from './discounts/discounts.module';
import { CustomersModule } from './customers/customers.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { SessionTokensModule } from './session-tokens/session-tokens.module';
import { V1Module } from './v1/v1.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AnalyticsModule } from './analytics/analytics.module';
import { RedisModule } from './redis/redis.module';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import {
  getClientIp,
  getContextPath,
  getGlobalRateLimitForContext,
  getScopedRateLimitForContext,
  rateLimitConfig,
  resolveScopedTrackerForContext,
  shouldSkipPath,
} from './config/rate-limit.config';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot({
      errorMessage: rateLimitConfig.messages.tooManyRequests,
      throttlers: [
        {
          name: 'default',
          ttl: (context) => getGlobalRateLimitForContext(context).ttlMs,
          limit: (context) => getGlobalRateLimitForContext(context).limit,
          getTracker: (request) => getClientIp(request as any),
          skipIf: (context) => shouldSkipPath(getContextPath(context)),
          setHeaders: true,
        },
        {
          name: 'scoped',
          ttl: (context) => getScopedRateLimitForContext(context).ttlMs,
          limit: (context) => getScopedRateLimitForContext(context).limit,
          getTracker: (_request, context) =>
            resolveScopedTrackerForContext(context) || 'skip-scoped',
          skipIf: (context) => !resolveScopedTrackerForContext(context),
          setHeaders: true,
        },
      ],
    }),
    ScheduleModule.forRoot(),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get('REDIS_HOST', 'localhost'),
        port: parseInt(configService.get('REDIS_PORT', '6379'), 10),
        ttl: 300, // Default TTL: 5 minutes
        max: 1000, // Maximum number of items in cache
      }),
      inject: [ConfigService],
    }),
    RedisModule, // Add our custom Redis module for idempotency
    SupabaseModule,
    AuthModule,
    UserModule,
    StripeModule,
    OrganizationModule,
    AccountModule,
    ProductsModule,
    FeaturesModule,
    SubscriptionsModule,
    CustomersModule,
    ApiKeysModule,
    SessionTokensModule,
    V1Module,
    AnalyticsModule,
    DiscountsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
