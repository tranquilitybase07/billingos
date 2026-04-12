import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutMetadataService } from './checkout-metadata.service';
import { StripeModule } from '../../stripe/stripe.module';
import { SupabaseModule } from '../../supabase/supabase.module';
import { SessionTokensModule } from '../../session-tokens/session-tokens.module';
import { BillingModule } from '../../billing/billing.module';

@Module({
  imports: [
    ConfigModule,
    StripeModule,
    SupabaseModule,
    SessionTokensModule,
    forwardRef(() => BillingModule),
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService, CheckoutMetadataService],
  exports: [CheckoutService, CheckoutMetadataService],
})
export class CheckoutModule {}
