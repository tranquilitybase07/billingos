import { Module, forwardRef } from '@nestjs/common';
import { BillingCleanupService } from './billing-cleanup.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { StripeModule } from '../stripe/stripe.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    SupabaseModule,
    QueueModule,
    forwardRef(() => StripeModule),
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [BillingCleanupService],
})
export class BillingModule {}
