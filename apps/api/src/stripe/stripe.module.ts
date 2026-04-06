import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { StripFeesService } from './stripe-fees.service';
import { RefundService } from './refund.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BillingModule } from '../billing/billing.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    ConfigModule,
    SupabaseModule,
    QueueModule,
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => BillingModule),
  ],
  controllers: [StripeController],
  providers: [
    StripeService,
    StripFeesService,
    RefundService,
  ],
  exports: [StripeService, StripFeesService, RefundService],
})
export class StripeModule {}
