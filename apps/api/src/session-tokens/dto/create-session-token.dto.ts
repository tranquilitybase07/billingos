import { IsString, IsNotEmpty, IsOptional, IsArray, IsInt, Min, Max } from 'class-validator';

export class CreateSessionTokenDto {
  @IsString()
  @IsNotEmpty()
  externalUserId: string; // Merchant's user ID

  @IsString()
  @IsOptional()
  externalOrganizationId?: string; // Optional: for B2B use cases

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedOperations?: string[]; // Optional: scope permissions (e.g., ["read_subscription", "update_payment_method"])

  @IsInt()
  @Min(60) // Minimum 1 minute
  @Max(86400) // Maximum 24 hours
  @IsOptional()
  expiresIn?: number; // Expiry in seconds (default: 3600 = 1 hour)

  @IsOptional()
  metadata?: Record<string, any>; // Optional: IP address, user agent, etc.
}
