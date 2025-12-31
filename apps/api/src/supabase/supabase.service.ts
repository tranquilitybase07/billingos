import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { Database } from '@shared/types/database';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient<Database>;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and Service Role Key must be provided');
    }

    this.supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  getClient(): SupabaseClient<Database> {
    return this.supabase;
  }

  // Database query builder with proper typing
  from<T extends keyof Database['public']['Tables']>(
    table: T,
  ): ReturnType<SupabaseClient<Database>['from']> {
    return this.supabase.from(table);
  }

  // Auth methods
  async getUserFromToken(token: string) {
    return this.supabase.auth.getUser(token);
  }
}
