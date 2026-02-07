import { IsString, IsOptional, IsInt, Min, IsObject } from 'class-validator';

export class UpdateFeatureLinkDto {
  @IsString()
  feature_id: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  display_order?: number;

  @IsObject()
  @IsOptional()
  config?: Record<string, any>;
}
