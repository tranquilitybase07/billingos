import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

export class TrackUsageDto {
  @IsString()
  @IsNotEmpty()
  customer_id: string;

  @IsString()
  @IsNotEmpty()
  feature_name: string;

  @IsNumber()
  @Min(0)
  units: number;

  @IsString()
  @IsOptional()
  idempotency_key?: string;
}
