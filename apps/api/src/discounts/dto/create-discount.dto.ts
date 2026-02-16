import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsInt,
  IsArray,
  Min,
  IsISO8601,
} from 'class-validator';

export class CreateDiscountDto {
  @IsString()
  @IsNotEmpty()
  organization_id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsEnum(['percentage', 'fixed'])
  type: 'percentage' | 'fixed';

  /** For percentage discounts: value in basis points (e.g. 2000 = 20%) */
  @IsNumber()
  @IsOptional()
  @Min(0)
  basis_points?: number;

  /** For fixed discounts: value in cents (e.g. 5000 = $50.00) */
  @IsNumber()
  @IsOptional()
  @Min(0)
  amount?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsEnum(['once', 'forever', 'repeating'])
  @IsOptional()
  duration?: 'once' | 'forever' | 'repeating';

  @IsInt()
  @IsOptional()
  @Min(1)
  duration_in_months?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  max_redemptions?: number;

  @IsArray()
  @IsOptional()
  product_ids?: any[];

  @IsISO8601()
  @IsOptional()
  starts_at?: string;

  @IsISO8601()
  @IsOptional()
  ends_at?: string;
}
