export class UserDto {
  id: string;
  email: string;
  email_verified: boolean;
  avatar_url?: string;
  is_admin: boolean;
  stripe_customer_id?: string;
  accepted_terms_of_service: boolean;
  accepted_terms_at?: Date;
  blocked_at?: Date;
  meta: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export class UpdateUserDto {
  avatar_url?: string;
  accepted_terms_of_service?: boolean;
  meta?: Record<string, any>;
}
