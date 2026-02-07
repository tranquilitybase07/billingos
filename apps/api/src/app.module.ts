import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
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
import { CustomersModule } from './customers/customers.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { SessionTokensModule } from './session-tokens/session-tokens.module';
import { V1Module } from './v1/v1.module';
import { JwtDebugMiddleware } from './middleware/jwt-debug.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get('REDIS_HOST', 'localhost'),
        port: parseInt(configService.get('REDIS_PORT', '6379'), 10),
        ttl: 300, // Default TTL: 5 minutes
        max: 1000, // Maximum number of items in cache
      }),
      inject: [ConfigService],
    }),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(JwtDebugMiddleware).forRoutes('*');
  }
}
