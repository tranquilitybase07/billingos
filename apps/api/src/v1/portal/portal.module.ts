import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { SupabaseModule } from '../../supabase/supabase.module';
import { AuthModule } from '../../auth/auth.module';
import { SessionTokensModule } from '../../session-tokens/session-tokens.module';
import { StripeModule } from '../../stripe/stripe.module';

@Module({
  imports: [SupabaseModule, AuthModule, SessionTokensModule, StripeModule],
  controllers: [PortalController],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
