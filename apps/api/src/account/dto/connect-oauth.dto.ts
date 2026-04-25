import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class GetOAuthUrlDto {
  @IsUUID()
  @IsNotEmpty()
  organization_id!: string;
}

export class OAuthCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;
}
