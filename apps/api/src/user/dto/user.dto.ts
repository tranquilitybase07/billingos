import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

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
  onboarding_step: string;
  onboarding_answers: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class UpdateUserDto {
  avatar_url?: string;
  accepted_terms_of_service?: boolean;
  meta?: Record<string, any>;
}

export class UpdateOnboardingDto {
  @IsOptional()
  @IsString()
  @IsIn(['questions', 'create_org', 'complete'])
  onboarding_step?: string;

  @IsOptional()
  @IsObject()
  onboarding_answers?: Record<string, unknown>;
}
