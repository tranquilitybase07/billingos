import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class ManualBindDto {
  @IsUUID()
  customer_id: string;

  @IsString()
  @IsNotEmpty()
  external_id: string;
}
