import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { StreamService } from './stream.service';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [ConversationsModule],
  providers: [ChatGateway, StreamService],
  exports: [StreamService],
})
export class ChatModule {}
