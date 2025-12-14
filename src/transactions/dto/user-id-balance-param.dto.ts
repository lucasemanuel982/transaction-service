import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class UserIdBalanceParamDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  userId: string;
}

