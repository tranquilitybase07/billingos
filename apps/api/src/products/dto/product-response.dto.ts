import { IsString, IsNumber, IsUUID, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePriceDto } from './create-price.dto';
import { LinkFeatureDto } from './link-feature.dto';

export enum ProductVersionStatus {
  CURRENT = 'current',
  SUPERSEDED = 'superseded',
  DEPRECATED = 'deprecated',
}

export class ProductResponseDto {
  @IsUUID()
  id: string;

  @IsUUID()
  organization_id: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  recurring_interval: string;

  @IsNumber()
  recurring_interval_count: number;

  @IsString()
  @IsOptional()
  stripe_product_id?: string;

  @IsNumber()
  trial_days: number;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsBoolean()
  is_archived: boolean;

  // Versioning fields
  @IsNumber()
  version: number;

  @IsUUID()
  @IsOptional()
  parent_product_id?: string;

  @IsUUID()
  @IsOptional()
  latest_version_id?: string;

  @IsEnum(ProductVersionStatus)
  version_status: ProductVersionStatus;

  @IsString()
  @IsOptional()
  version_created_reason?: string;

  @IsString()
  @IsOptional()
  version_created_at?: string;

  // Computed fields
  @IsBoolean()
  @IsOptional()
  has_active_subscriptions?: boolean;

  @IsNumber()
  @IsOptional()
  subscription_count?: number;

  @IsNumber()
  @IsOptional()
  active_subscription_count?: number;

  // Relations
  @Type(() => CreatePriceDto)
  @IsOptional()
  prices?: CreatePriceDto[];

  @Type(() => LinkFeatureDto)
  @IsOptional()
  features?: LinkFeatureDto[];

  @IsString()
  created_at: string;

  @IsString()
  updated_at: string;
}

export class ProductVersionSummaryDto {
  @IsUUID()
  id: string;

  @IsNumber()
  version: number;

  @IsEnum(ProductVersionStatus)
  version_status: ProductVersionStatus;

  @IsNumber()
  subscription_count: number;

  @IsNumber()
  active_subscription_count: number;

  @IsNumber()
  total_mrr: number;

  @IsString()
  @IsOptional()
  version_created_reason?: string;

  @IsString()
  created_at: string;
}

export class ProductVersionsResponseDto {
  @Type(() => ProductVersionSummaryDto)
  versions: ProductVersionSummaryDto[];

  @IsNumber()
  total_subscriptions: number;

  @IsNumber()
  total_monthly_revenue: number;

  @IsNumber()
  @IsOptional()
  potential_revenue_if_migrated?: number;
}

export class VersioningAnalysisDto {
  @IsBoolean()
  will_version: boolean;

  @IsNumber()
  @IsOptional()
  current_version?: number;

  @IsNumber()
  @IsOptional()
  new_version?: number;

  @IsNumber()
  @IsOptional()
  affected_subscriptions?: number;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString({ each: true })
  @IsOptional()
  changes?: string[];
}