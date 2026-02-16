import { IsString, IsEnum, IsOptional } from 'class-validator';

export class CancelSubscriptionDto {
  @IsString()
  subscriptionId: string;

  @IsEnum(['immediate', 'end_of_period'])
  timing: 'immediate' | 'end_of_period';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  feedback?: string;
}
