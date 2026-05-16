import { Module } from '@nestjs/common';
import { V1CustomersController } from './customers.controller';
import { SupabaseModule } from '../../supabase/supabase.module';
import { CustomersModule } from '../../customers/customers.module';
import { ApiKeysModule } from '../../api-keys/api-keys.module';

@Module({
  imports: [SupabaseModule, CustomersModule, ApiKeysModule],
  controllers: [V1CustomersController],
})
export class V1CustomersModule {}
