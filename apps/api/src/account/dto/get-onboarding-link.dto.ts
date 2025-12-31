import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

export class GetOnboardingLinkDto {
  @IsUrl()
  @IsOptional()
  return_url?: string;

  @IsUrl()
  @IsOptional()
  refresh_url?: string;
}
