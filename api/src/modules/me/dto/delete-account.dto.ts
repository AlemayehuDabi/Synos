import { IsOptional, IsString } from 'class-validator';

export class DeleteAccountDto {
  /** Required unless the account has no credential (password) sign-in method. */
  @IsOptional()
  @IsString()
  password?: string;
}
