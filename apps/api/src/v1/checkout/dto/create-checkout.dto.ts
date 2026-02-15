import { IsString, IsOptional, IsObject, IsNotEmpty, IsIn } from 'class-validator';

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

  @IsString()
  @IsOptional()
  @IsIn(['embedded', 'redirect'])
  mode?: 'embedded' | 'redirect';

  @IsString()
  @IsOptional()
  successUrl?: string;

  @IsString()
  @IsOptional()
  cancelUrl?: string;

  @IsString()
  @IsOptional()
  couponCode?: string;

  @IsObject()
  @IsOptional()
  customer?: {
    email?: string;
    name?: string;
    taxId?: string;
  };
}