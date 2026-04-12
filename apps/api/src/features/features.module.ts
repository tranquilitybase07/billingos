import { Module, forwardRef } from '@nestjs/common';
import { FeaturesController } from './features.controller';
import { FeaturesService } from './features.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { StripeModule } from '../stripe/stripe.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    SupabaseModule,
    forwardRef(() => StripeModule),
    forwardRef(() => BillingModule),
  ],
  controllers: [FeaturesController],
  providers: [FeaturesService],
  exports: [FeaturesService],
})
export class FeaturesModule {}
