import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  conversationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content!: string;

  @IsString()
  @IsNotEmpty()
  requestId!: string;
}
