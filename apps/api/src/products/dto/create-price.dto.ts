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
}
