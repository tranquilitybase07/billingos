import { Module } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { StripeModule } from '../stripe/stripe.module';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [SupabaseModule, StripeModule, AccountModule],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
