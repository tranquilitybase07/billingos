import { Module } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { InvitationsController } from './invitations.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { StripeModule } from '../stripe/stripe.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [SupabaseModule, StripeModule, EmailModule],
  controllers: [OrganizationController, InvitationsController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
