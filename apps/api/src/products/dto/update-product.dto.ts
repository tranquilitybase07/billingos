import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsObject,
  IsArray,
  IsBoolean,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePriceDto } from './create-price.dto';
import { LinkFeatureDto } from './link-feature.dto';
import { UpdateFeatureLinkDto } from './update-feature-link.dto';

class PriceOperationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePriceDto)
  @IsOptional()
  create?: CreatePriceDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  archive?: string[];
}

class FeatureOperationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkFeatureDto)
  @IsOptional()
  link?: LinkFeatureDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  unlink?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateFeatureLinkDto)
  @IsOptional()
  update?: UpdateFeatureLinkDto[];
}

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  trial_days?: number;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ValidateNested()
  @Type(() => PriceOperationsDto)
  @IsOptional()
  prices?: PriceOperationsDto;

  @ValidateNested()
  @Type(() => FeatureOperationsDto)
  @IsOptional()
  features?: FeatureOperationsDto;
}

export class CheckVersioningDto extends UpdateProductDto {
  @IsBoolean()
  @IsOptional()
  check_only?: boolean; // If true, only check if versioning would occur, don't actually update
}
