import {
  Controller,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import { UploadService } from './upload.service';
import { ConversationsService } from '../conversations/conversations.service';
import { Server } from 'socket.io';

@Controller('conversations')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  // Injected by ChatGateway after gateway init to broadcast chat:complete
  socketServer: Server | null = null;

  constructor(
    private readonly uploadService: UploadService,
    private readonly conversationsService: ConversationsService,
  ) {}

  @Post(':conversationId/upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadDocument(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query('userId', ParseUUIDPipe) userId: string,
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
  ): Promise<{ message: string; chunks: number }> {
    // Verify conversation belongs to user
    await this.conversationsService.findOne(conversationId, userId);

    const content = file.buffer.toString('utf-8');
    const result = await this.uploadService.processDocument(
      conversationId,
      userId,
      file.originalname,
      content,
    );

    this.logger.log(`Upload complete: ${result.totalChunks} chunks from "${result.filename}"`);

    // Emit summary to connected WebSocket client
    if (this.socketServer) {
      const peopleList =
        result.extractedPeople.length > 0
          ? result.extractedPeople.join(', ')
          : 'no specific people yet';

      this.socketServer.to(userId).emit('chat:complete', {
        requestId: `upload-${Date.now()}`,
        conversationId,
        message: `I've read your document "${result.filename}". I noticed mentions of ${peopleList}. What would you like to discuss about it?`,
        type: 'document_processed',
      });
    }

    return {
      message: `Document processed successfully into ${result.totalChunks} chunks`,
      chunks: result.totalChunks,
    };
  }
}
