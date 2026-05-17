import { IsUUID } from 'class-validator';

export class CopyProductsDto {
  @IsUUID()
  source_org_id!: string;

  @IsUUID()
  target_org_id!: string;
}
