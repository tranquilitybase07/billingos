import { IsNotEmpty, IsUUID } from 'class-validator';

export class GetOAuthUrlDto {
  @IsUUID()
  @IsNotEmpty()
  organization_id!: string;
}
