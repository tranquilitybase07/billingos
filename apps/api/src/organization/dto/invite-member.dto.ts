import { IsEmail, IsIn, IsNotEmpty, IsOptional } from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsIn(['admin', 'member'])
  role?: 'admin' | 'member';
}
