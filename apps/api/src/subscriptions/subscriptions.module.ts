import { Module, forwardRef } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionUpgradeService } from './subscription-upgrade.service';
import { SubscriptionSchedulerService } from './subscription-scheduler.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { StripeModule } from '../stripe/stripe.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SupabaseModule, forwardRef(() => StripeModule), AuthModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionUpgradeService, SubscriptionSchedulerService],
  exports: [SubscriptionsService, SubscriptionUpgradeService],
})
export class SubscriptionsModule {}
