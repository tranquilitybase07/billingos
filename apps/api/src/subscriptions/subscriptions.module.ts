import { Module, forwardRef } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionTransitionService } from './subscription-transition.service';
import { SubscriptionSchedulerService } from './subscription-scheduler.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { StripeModule } from '../stripe/stripe.module';
import { BillingModule } from '../billing/billing.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    SupabaseModule,
    forwardRef(() => StripeModule),
    forwardRef(() => BillingModule),
    AuthModule,
  ],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    SubscriptionTransitionService,
    SubscriptionSchedulerService,
  ],
  exports: [SubscriptionsService, SubscriptionTransitionService],
})
export class SubscriptionsModule {}
