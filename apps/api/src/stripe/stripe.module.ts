import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { AdaptivePricingWebhookService } from './adaptive-pricing-webhook.service';
import { StripFeesService } from './stripe-fees.service';
import { RefundService } from './refund.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    ConfigModule,
    SupabaseModule,
    QueueModule,
    forwardRef(() => SubscriptionsModule),
  ],
  controllers: [StripeController],
  providers: [
    StripeService,
    StripeWebhookService,
    AdaptivePricingWebhookService,
    StripFeesService,
    RefundService,
  ],
  exports: [StripeService, StripFeesService, RefundService],
})
export class StripeModule {}
