import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsObject,
  MaxLength,
  Matches,
} from 'class-validator';

export enum FeatureType {
  BOOLEAN_FLAG = 'boolean_flag',
  USAGE_QUOTA = 'usage_quota',
  NUMERIC_LIMIT = 'numeric_limit',
}

export class CreateFeatureDto {
  @IsString()
  @IsNotEmpty()
  organization_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Feature name must contain only lowercase letters, numbers, and underscores',
  })
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(FeatureType)
  type: FeatureType;

  @IsObject()
  @IsOptional()
  properties?: Record<string, any>;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
