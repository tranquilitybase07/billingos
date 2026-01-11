import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  ValidateIf,
} from 'class-validator';

export enum PriceAmountType {
  FIXED = 'fixed',
  FREE = 'free',
}

export enum RecurringInterval {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export class CreatePriceDto {
  @IsEnum(PriceAmountType)
  @IsNotEmpty()
  amount_type: PriceAmountType;

  @ValidateIf((o) => o.amount_type === PriceAmountType.FIXED)
  @IsInt()
  @Min(0)
  @IsNotEmpty()
  price_amount?: number; // Price in cents

  @IsString()
  @IsOptional()
  price_currency?: string = 'usd'; // ISO currency code

  // Optional: Override product-level recurring_interval for this specific price
  // Useful for offering both monthly and yearly options for the same product
  @IsEnum(RecurringInterval)
  @IsOptional()
  recurring_interval?: RecurringInterval;

  @IsInt()
  @Min(1)
  @IsOptional()
  recurring_interval_count?: number;
}
