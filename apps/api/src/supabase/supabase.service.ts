import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { Database } from '../../../../packages/shared/types/database';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient<Database>;

  constructor(private configService: ConfigService) {
    const isSandbox = this.configService.get<string>('NODE_ENV') === 'sandbox';

    const supabaseUrl = isSandbox
      ? this.configService.get<string>('SANDBOX_SUPABASE_URL') ||
        this.configService.get<string>('SUPABASE_URL')
      : this.configService.get<string>('SUPABASE_URL');

    const supabaseKey = isSandbox
      ? this.configService.get<string>('SANDBOX_SUPABASE_SERVICE_ROLE_KEY') ||
        this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')
      : this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

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

  // Auth methods
  async getUserFromToken(token: string) {
    return this.supabase.auth.getUser(token);
  }
}
