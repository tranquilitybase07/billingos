import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';

export class ChurnEventDto {
  @IsString()
  subscriptionId: string;

  @IsEnum([
    'flow_started',
    'survey_submitted',
    'offer_shown',
    'offer_accepted',
    'offer_declined',
    'canceled',
    'abandoned',
  ])
  eventType:
    | 'flow_started'
    | 'survey_submitted'
    | 'offer_shown'
    | 'offer_accepted'
    | 'offer_declined'
    | 'canceled'
    | 'abandoned';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  feedback?: string;

  @IsOptional()
  @IsObject()
  offer?: Record<string, unknown>;
}

export class ApplyOfferDto {
  @IsString()
  subscriptionId: string;

  @IsString()
  reason: string;
}

export class ChurnCancelDto {
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
