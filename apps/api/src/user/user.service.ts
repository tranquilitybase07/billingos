import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateUserDto } from './dto/user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UserService {
  constructor(private supabaseService: SupabaseService) {}

  async findById(id: string): Promise<User> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new NotFoundException('User not found');
    }

    return data as User;
  }

  async findByEmail(email: string): Promise<User | null> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      return null;
    }

    return data as User;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('users')
      .update(updateUserDto)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }

    return data as User;
  }

  async acceptTerms(id: string): Promise<User> {
    return this.update(id, {
      accepted_terms_of_service: true,
    });
  }
}
