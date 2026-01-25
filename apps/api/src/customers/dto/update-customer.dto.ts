import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateCustomerDto } from './create-customer.dto';
import { IsString, IsOptional, Matches, MaxLength } from 'class-validator';

// Omit organization_id as it cannot be changed after creation
export class UpdateCustomerDto extends PartialType(
  OmitType(CreateCustomerDto, ['organization_id'] as const),
) {
  // Override external_id to add custom validation message for updates
  @IsString()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'external_id must contain only alphanumeric characters, hyphens, and underscores',
  })
  @MaxLength(255)
  external_id?: string;
}
