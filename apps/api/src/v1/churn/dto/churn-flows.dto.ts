import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsObject,
} from 'class-validator';

export class ListChurnFlowsQueryDto {
  @IsString()
  organization_id: string;
}

export class CreateChurnFlowDto {
  @IsString()
  organization_id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  steps?: unknown[];

  @IsOptional()
  @IsObject()
  targeting?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class UpdateChurnFlowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  steps?: unknown[];

  @IsOptional()
  @IsObject()
  targeting?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
