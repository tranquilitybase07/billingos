import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class ProductMappingDto {
  @IsString()
  @IsNotEmpty()
  stripe_product_id: string;

  @IsUUID()
  bos_product_id: string;
}

export class SaveMappingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMappingDto)
  mappings: ProductMappingDto[];
}
