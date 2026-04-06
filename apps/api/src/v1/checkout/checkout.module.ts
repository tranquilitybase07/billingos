import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutMetadataService } from './checkout-metadata.service';
import { StripeModule } from '../../stripe/stripe.module';
import { SupabaseModule } from '../../supabase/supabase.module';
import { SessionTokensModule } from '../../session-tokens/session-tokens.module';
import { CustomersModule } from '../../customers/customers.module';
import { RedisModule } from '../../redis/redis.module';
import { QueueModule } from '../../queue/queue.module';
import { SubscriptionsModule } from '../../subscriptions/subscriptions.module';
import { BillingModule } from '../../billing/billing.module';

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
    forwardRef(() => BillingModule),
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService, CheckoutMetadataService],
  exports: [CheckoutService, CheckoutMetadataService],
})
export class CheckoutModule {}
