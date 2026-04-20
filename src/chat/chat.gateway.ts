import { Logger, Optional, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConversationsService } from '../conversations/conversations.service';
import { StreamService } from './stream.service';
import { SendMessageDto } from '../conversations/dto/send-message.dto';
import { UploadController } from '../upload/upload.controller';
import { ContextAssemblyService } from '../memory/context-assembly.service';
import { EmbeddingService } from '../memory/embedding.service';

interface AuthenticatedSocket extends Socket {
  userId: string;
}

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/',
})
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  readonly server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly streamService: StreamService,
    private readonly contextAssembly: ContextAssemblyService,
    private readonly embeddingService: EmbeddingService,
    @Optional() private readonly uploadController: UploadController,
  ) {}

  afterInit(server: Server): void {
    if (this.uploadController) {
      this.uploadController.socketServer = server;
    }
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket): void {
    const userId = client.handshake.query['userId'];

    if (!userId || typeof userId !== 'string') {
      this.logger.warn(`Client ${client.id} rejected — missing userId`);
      client.disconnect();
      return;
    }

    (client as AuthenticatedSocket).userId = userId;
    void client.join(userId);
    this.logger.log(`Client connected: ${client.id} userId=${userId}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('chat:send')
  async handleMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: SendMessageDto,
  ): Promise<void> {
    const { conversationId, content, requestId } = dto;
    const userId = client.userId;

    try {
      await this.conversationsService.findOne(conversationId, userId);

      const userMessage = await this.conversationsService.saveMessage(
        conversationId,
        userId,
        'user',
        content,
      );

      // Run embedding + context assembly in parallel with history fetch
      const [history, memoryContext] = await Promise.all([
        this.conversationsService.getRecentMessages(conversationId, 11),
        this.contextAssembly.assembleContext(userId, content),
      ]);

      const historyWithoutLatest = history.filter((m) => m.id !== userMessage.id);

      let fullResponse = '';

      for await (const chunk of this.streamService.streamResponse(
        content,
        historyWithoutLatest,
        memoryContext,
      )) {
        fullResponse += chunk;
        client.emit('chat:chunk', { requestId, chunk });
      }

      const assistantMessage = await this.conversationsService.saveMessage(
        conversationId,
        userId,
        'assistant',
        fullResponse,
      );

      // Store user message embedding in background (don't await — non-blocking)
      void this.embeddingService.storeEmbedding(userId, content, 'message', {
        conversationId,
        messageId: userMessage.id,
      }, userMessage.id);

      client.emit('chat:complete', {
        requestId,
        messageId: assistantMessage.id,
        conversationId,
      });

      this.logger.debug(`Completed response for requestId=${requestId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`chat:send error: ${message}`, err instanceof Error ? err.stack : '');
      client.emit('chat:error', { requestId, message });
    }
  }
}
