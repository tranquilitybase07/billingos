import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class SubmitBusinessDetailsDto {
  @IsString()
  @IsNotEmpty()
  about: string;

  @IsString()
  @IsNotEmpty()
  product_description: string;

  @IsString()
  @IsNotEmpty()
  intended_use: string;

  @IsString()
  @IsOptional()
  customer_acquisition?: string;

  @IsNumber()
  @IsOptional()
  future_annual_revenue?: number;

  @IsString()
  @IsOptional()
  switching?: string; // 'yes' or 'no'

  @IsString()
  @IsOptional()
  switching_from?: string;

  @IsNumber()
  @IsOptional()
  previous_annual_revenue?: number;

  // Allow additional fields for flexibility
  [key: string]: any;
}
