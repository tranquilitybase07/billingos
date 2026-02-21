import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsArray,
  ValidateNested,
  IsObject,
  IsBoolean,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePriceDto } from './create-price.dto';
import { LinkFeatureDto } from './link-feature.dto';

export enum RecurringInterval {
  MONTH = 'month',
  YEAR = 'year',
  WEEK = 'week',
  DAY = 'day',
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  organization_id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(RecurringInterval)
  @IsNotEmpty()
  recurring_interval: RecurringInterval;

  @IsInt()
  @Min(1)
  @IsOptional()
  recurring_interval_count?: number = 1;

  @IsInt()
  @Min(0)
  @IsOptional()
  trial_days?: number = 0;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePriceDto)
  prices: CreatePriceDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LinkFeatureDto)
  features?: LinkFeatureDto[];

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  visible_in_pricing_table?: boolean = true; // Defaults to true - products are visible by default
}
