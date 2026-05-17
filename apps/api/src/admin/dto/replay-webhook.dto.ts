import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReplayWebhookDto {
  /**
   * Free-form note from the operator explaining why the replay was kicked
   * off (e.g. "customer reported missing entitlement after 4xx"). Stored on
   * the admin-side audit log only.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
