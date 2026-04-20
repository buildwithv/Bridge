import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { StreamService } from './stream.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { UploadModule } from '../upload/upload.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [ConversationsModule, UploadModule, MemoryModule],
  providers: [ChatGateway, StreamService],
  exports: [StreamService],
})
export class ChatModule {}
