import { IsUUID, IsOptional, IsEnum } from 'class-validator';

export enum ChangeEffectiveTiming {
  IMMEDIATE = 'immediate',
  PERIOD_END = 'period_end',
}

export class PreviewChangeDto {
  @IsUUID()
  new_price_id: string;

  @IsOptional()
  @IsEnum(ChangeEffectiveTiming)
  effective_date?: ChangeEffectiveTiming = ChangeEffectiveTiming.IMMEDIATE;
}
