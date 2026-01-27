import { Module } from '@nestjs/common';
import { V1ProductsController } from './products.controller';
import { V1ProductsService } from './products.service';
import { SupabaseModule } from '../../supabase/supabase.module';
import { SessionTokensModule } from '../../session-tokens/session-tokens.module';

@Module({
  imports: [SupabaseModule, SessionTokensModule],
  controllers: [V1ProductsController],
  providers: [V1ProductsService],
  exports: [V1ProductsService],
})
export class V1ProductsModule {}
