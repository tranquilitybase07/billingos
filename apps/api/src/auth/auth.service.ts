import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { User } from '../user/entities/user.entity';
import { User as SupabaseUser } from '@supabase/supabase-js';

@Injectable()
export class AuthService {
  constructor(private supabaseService: SupabaseService) {}

  async validateUser(userId: string): Promise<User> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new UnauthorizedException('User not found');
    }

    if (data?.blocked_at) {
      throw new UnauthorizedException('User is blocked');
    }
    return data as User;
  }

  async verifyToken(token: string): Promise<SupabaseUser> {
    const { data, error } = await this.supabaseService.getUserFromToken(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid token');
    }

    return data.user;
  }
}
