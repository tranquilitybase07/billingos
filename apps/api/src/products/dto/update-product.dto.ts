import { IsString, IsOptional, IsInt, Min, IsObject } from 'class-validator';

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
}
