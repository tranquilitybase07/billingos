import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [SupabaseModule, StripeModule],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
