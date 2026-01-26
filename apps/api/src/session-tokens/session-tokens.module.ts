import { Module } from '@nestjs/common';
import { SessionTokensService } from './session-tokens.service';
import { SessionTokensController } from './session-tokens.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [SupabaseModule, ApiKeysModule], // Import ApiKeysModule for ApiKeysService
  controllers: [SessionTokensController],
  providers: [SessionTokensService],
  exports: [SessionTokensService], // Export for use in guards
})
export class SessionTokensModule {}
