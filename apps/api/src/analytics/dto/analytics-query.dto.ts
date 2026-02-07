import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum Granularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class AnalyticsQueryDto {
  @IsString()
  @IsNotEmpty()
  organization_id: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsEnum(Granularity)
  granularity?: Granularity = Granularity.DAY;
}

export class TopCustomersQueryDto {
  @IsString()
  @IsNotEmpty()
  organization_id: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
