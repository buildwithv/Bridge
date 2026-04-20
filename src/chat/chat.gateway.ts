import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConversationsService } from '../conversations/conversations.service';
import { StreamService } from './stream.service';
import { SendMessageDto } from '../conversations/dto/send-message.dto';

interface AuthenticatedSocket extends Socket {
  userId: string;
}

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/',
})
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  readonly server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly streamService: StreamService,
  ) {}

  handleConnection(client: Socket): void {
    const userId = client.handshake.query['userId'];

    if (!userId || typeof userId !== 'string') {
      this.logger.warn(`Client ${client.id} rejected — missing userId`);
      client.disconnect();
      return;
    }

    (client as AuthenticatedSocket).userId = userId;
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
      // Verify conversation belongs to user
      await this.conversationsService.findOne(conversationId, userId);

      // Persist user message
      const userMessage = await this.conversationsService.saveMessage(
        conversationId,
        userId,
        'user',
        content,
      );

      // Fetch recent history for context (last 10 messages, excluding the one just saved)
      const history = await this.conversationsService.getRecentMessages(conversationId, 11);
      const historyWithoutLatest = history.filter((m) => m.id !== userMessage.id);

      // Stream AI response token by token
      let fullResponse = '';

      for await (const chunk of this.streamService.streamResponse(
        content,
        historyWithoutLatest,
        '', // memory context injected in Phase 4
      )) {
        fullResponse += chunk;
        client.emit('chat:chunk', { requestId, chunk });
      }

      // Persist assistant response
      const assistantMessage = await this.conversationsService.saveMessage(
        conversationId,
        userId,
        'assistant',
        fullResponse,
      );

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
