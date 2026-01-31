import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class ConfirmCheckoutDto {
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  @IsString()
  @IsOptional()
  returnUrl?: string;
}