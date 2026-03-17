import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class StartMigrationDto {
  @IsUUID()
  organization_id: string;

  @IsBoolean()
  @IsOptional()
  include_archived?: boolean;
}
