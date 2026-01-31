import { IsString, IsOptional, IsObject, IsNotEmpty } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @IsNotEmpty()
  priceId: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  existingSubscriptionId?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}