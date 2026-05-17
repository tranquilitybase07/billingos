import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReconcileDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
