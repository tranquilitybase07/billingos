import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Global()
@Module({
  imports: [SupabaseModule],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}