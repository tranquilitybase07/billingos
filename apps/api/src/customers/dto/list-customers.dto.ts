import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsEnum,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CustomerSortField {
  CREATED_AT = 'created_at',
  EMAIL = 'email',
  NAME = 'name',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListCustomersDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  external_id?: string;

  @IsOptional()
  @IsString()
  query?: string; // Search across name, email, external_id

  @IsOptional()
  @IsEnum(CustomerSortField)
  sort_by?: CustomerSortField = CustomerSortField.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  sort_order?: SortOrder = SortOrder.DESC;
}
