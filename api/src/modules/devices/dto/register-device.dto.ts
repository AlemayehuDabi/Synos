import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class RegisterDeviceDto {
  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';

  @IsString()
  @Length(1, 512)
  pushToken!: string;

  @IsOptional()
  @IsString()
  appVersion?: string;
}
