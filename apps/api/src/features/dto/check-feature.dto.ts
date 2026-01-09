import { IsString, IsNotEmpty } from 'class-validator';

export class CheckFeatureDto {
  @IsString()
  @IsNotEmpty()
  customer_id: string;

  @IsString()
  @IsNotEmpty()
  feature_name: string;
}
