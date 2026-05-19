import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const SUBSCRIPTION_TYPES = [
  'saas',
  'usage_based',
  'seat_based',
  'hybrid',
  'not_sure',
] as const;
export type SubscriptionType = (typeof SUBSCRIPTION_TYPES)[number];

export const USER_COUNTS = ['0', '1-100', '100-1k', '1k-10k', '10k+'] as const;
export type UserCount = (typeof USER_COUNTS)[number];

export class SubmitBetaApplicationDto {
  @IsString()
  @MaxLength(2000)
  building!: string;

  @IsIn(SUBSCRIPTION_TYPES)
  subscription_type!: SubscriptionType;

  @IsIn(USER_COUNTS)
  user_count!: UserCount;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}
