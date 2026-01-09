import { IsBoolean, IsOptional } from 'class-validator';

export class CancelSubscriptionDto {
  @IsBoolean()
  @IsOptional()
  cancel_at_period_end?: boolean = true;
}
