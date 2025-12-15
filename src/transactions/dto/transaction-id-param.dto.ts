import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class TransactionIdParamDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id: string;
}
