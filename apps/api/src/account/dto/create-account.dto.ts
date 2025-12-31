import { IsString, IsNotEmpty, IsEmail, IsOptional, IsIn, Length } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  organization_id: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  country: string; // ISO 2-letter country code

  @IsString()
  @IsOptional()
  @IsIn(['individual', 'company', 'non_profit', 'government_entity'])
  business_type?: 'individual' | 'company' | 'non_profit' | 'government_entity';
}
