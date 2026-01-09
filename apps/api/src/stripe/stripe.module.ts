import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripFeesService } from './stripe-fees.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule,
    SupabaseModule,
    forwardRef(() => SubscriptionsModule),
  ],
  controllers: [StripeController],
  providers: [StripeService, StripeWebhookService, StripFeesService],
  exports: [StripeService, StripFeesService], // Export for use in other modules
})
export class StripeModule {}
