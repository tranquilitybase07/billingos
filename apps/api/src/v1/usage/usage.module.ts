import { Module } from '@nestjs/common';
import { V1UsageController } from './usage.controller';
import { FeaturesModule } from '../../features/features.module';
import { CustomersModule } from '../../customers/customers.module';
import { ApiKeysModule } from '../../api-keys/api-keys.module';

@Module({
  imports: [FeaturesModule, CustomersModule, ApiKeysModule],
  controllers: [V1UsageController],
})
export class V1UsageModule {}
