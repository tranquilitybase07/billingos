import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';

export enum ApiKeyType {
  SECRET = 'secret',
  PUBLISHABLE = 'publishable',
}

export enum ApiKeyEnvironment {
  LIVE = 'live',
  TEST = 'test',
}

export class CreateApiKeyDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string; // Optional user-friendly label (e.g., "Production API", "Staging")

  @IsEnum(ApiKeyEnvironment)
  @IsOptional()
  environment?: ApiKeyEnvironment; // Default: 'test' (creates both secret and publishable keys)
}
