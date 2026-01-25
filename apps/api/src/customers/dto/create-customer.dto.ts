import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Matches,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BillingAddressDto {
  @IsString()
  @IsOptional()
  street?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  postal_code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2)
  country?: string; // ISO 3166-1 alpha-2 country code
}

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  organization_id: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  name?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'external_id must contain only alphanumeric characters, hyphens, and underscores',
  })
  @MaxLength(255)
  external_id?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BillingAddressDto)
  billing_address?: BillingAddressDto;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
