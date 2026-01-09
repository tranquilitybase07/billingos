import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsOptional,
  IsObject,
} from 'class-validator';

export class LinkFeatureDto {
  @IsString()
  @IsNotEmpty()
  feature_id: string;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  display_order: number;

  @IsObject()
  @IsOptional()
  config?: Record<string, any>; // Product-specific feature configuration overrides
}
