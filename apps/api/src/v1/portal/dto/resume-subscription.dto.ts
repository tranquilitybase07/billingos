import { IsString } from 'class-validator';

export class ResumeSubscriptionDto {
  @IsString()
  subscriptionId: string;
}
