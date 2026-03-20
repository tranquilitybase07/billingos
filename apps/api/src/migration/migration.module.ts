import { Module } from '@nestjs/common';
import { MigrationService } from './migration.service';
import { MigrationController } from './migration.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [SupabaseModule, StripeModule],
  controllers: [MigrationController],
  providers: [MigrationService],
  exports: [MigrationService],
})
export class MigrationModule {}
