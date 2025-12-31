import { IsString, IsOptional, IsEmail, IsObject, IsArray, IsBoolean } from 'class-validator';

export class UpdateOrganizationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  avatar_url?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsArray()
  @IsOptional()
  socials?: Array<{ platform: string; url: string }>;

  @IsObject()
  @IsOptional()
  profile_settings?: Record<string, any>;

  @IsObject()
  @IsOptional()
  subscription_settings?: Record<string, any>;

  @IsObject()
  @IsOptional()
  order_settings?: Record<string, any>;

  @IsObject()
  @IsOptional()
  notification_settings?: Record<string, any>;

  @IsObject()
  @IsOptional()
  customer_email_settings?: Record<string, any>;

  @IsObject()
  @IsOptional()
  customer_portal_settings?: Record<string, any>;

  @IsObject()
  @IsOptional()
  feature_settings?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  subscriptions_billing_engine?: boolean;
}
