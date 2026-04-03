import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutMetadataService } from './checkout-metadata.service';
import { AdaptivePricingService } from './adaptive-pricing.service';
import { StripeModule } from '../../stripe/stripe.module';
import { SupabaseModule } from '../../supabase/supabase.module';
import { SessionTokensModule } from '../../session-tokens/session-tokens.module';
import { CustomersModule } from '../../customers/customers.module';
import { RedisModule } from '../../redis/redis.module';
import { QueueModule } from '../../queue/queue.module';
import { SubscriptionsModule } from '../../subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule,
    StripeModule,
    SupabaseModule,
    SessionTokensModule,
    CustomersModule,
    RedisModule,
    QueueModule,
    SubscriptionsModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService, CheckoutMetadataService, AdaptivePricingService],
  exports: [CheckoutService, CheckoutMetadataService, AdaptivePricingService],
})
export class CheckoutModule {}
