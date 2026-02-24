import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutMetadataService } from './checkout-metadata.service';
import { StripeModule } from '../../stripe/stripe.module';
import { SupabaseModule } from '../../supabase/supabase.module';
import { SessionTokensModule } from '../../session-tokens/session-tokens.module';
import { CustomersModule } from '../../customers/customers.module';

@Module({
  imports: [
    StripeModule,
    SupabaseModule,
    SessionTokensModule,
    CustomersModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService, CheckoutMetadataService],
  exports: [CheckoutService, CheckoutMetadataService],
})
export class CheckoutModule {}