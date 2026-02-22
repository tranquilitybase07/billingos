import { IsUUID, IsOptional, IsNumber, IsEnum } from 'class-validator';

export enum ChangeEffectiveTiming {
  IMMEDIATE = 'immediate',
  PERIOD_END = 'period_end',
}

export class ChangePlanDto {
  @IsUUID()
  new_price_id: string;

  @IsOptional()
  @IsNumber()
  confirm_amount?: number; // Amount in cents - must match preview for safety

  @IsOptional()
  @IsEnum(ChangeEffectiveTiming)
  effective_date?: ChangeEffectiveTiming = ChangeEffectiveTiming.IMMEDIATE;
}
