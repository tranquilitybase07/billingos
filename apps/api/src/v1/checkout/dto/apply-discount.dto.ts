import { IsNotEmpty, IsString } from 'class-validator';

export class ApplyDiscountDto {
  @IsNotEmpty()
  @IsString()
  code!: string;
}
