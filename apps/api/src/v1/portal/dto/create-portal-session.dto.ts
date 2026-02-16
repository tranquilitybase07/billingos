import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreatePortalSessionDto {
  @IsString()
  @IsOptional()
  customerId?: string; // If provided, load specific customer's data

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>; // Optional metadata for tracking
}
