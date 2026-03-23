import { IsString, IsNotEmpty } from 'class-validator';

export class GenerateUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;
}
