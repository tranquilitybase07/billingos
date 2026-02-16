import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsInt,
  IsArray,
  Min,
  IsISO8601,
} from 'class-validator';

export class UpdateDiscountDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsEnum(['percentage', 'fixed'])
  @IsOptional()
  type?: 'percentage' | 'fixed';

  @IsNumber()
  @IsOptional()
  @Min(0)
  basis_points?: number;

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

  /** Product IDs this discount applies to. Empty = all products */
  @IsArray()
  @IsOptional()
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
