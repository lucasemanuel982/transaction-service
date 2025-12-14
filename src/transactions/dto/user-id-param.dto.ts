import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class UserIdParamDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id: string;
}
