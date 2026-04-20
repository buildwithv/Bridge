import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { ChunkingService } from './chunking.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [ConversationsModule, MemoryModule],
  controllers: [UploadController],
  providers: [UploadService, ChunkingService],
  exports: [UploadService, ChunkingService],
})
export class UploadModule {}
