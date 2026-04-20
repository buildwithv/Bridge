import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { Database } from '../database/database.types';

type Conversation = Database['public']['Tables']['conversations']['Row'];
type Message = Database['public']['Tables']['conversation_messages']['Row'];

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(private readonly db: DatabaseService) {}

  async create(userId: string, title?: string): Promise<Conversation> {
    const row = await this.db.queryOne<Conversation>(
      `INSERT INTO conversations (user_id, title)
       VALUES ($1, $2)
       RETURNING *`,
      [userId, title ?? null],
    );
    if (!row) throw new Error('Failed to create conversation');
    return row;
  }

  async findOne(conversationId: string, userId: string): Promise<Conversation> {
    const row = await this.db.queryOne<Conversation>(
      `SELECT * FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId],
    );
    if (!row) throw new NotFoundException(`Conversation ${conversationId} not found`);
    return row;
  }

  async findAll(userId: string): Promise<Conversation[]> {
    return this.db.query<Conversation>(
      `SELECT * FROM conversations WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
  }

  async saveMessage(
    conversationId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<Message> {
    const row = await this.db.queryOne<Message>(
      `INSERT INTO conversation_messages (conversation_id, user_id, role, content, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [conversationId, userId, role, content, JSON.stringify(metadata)],
    );
    if (!row) throw new Error('Failed to save message');
    this.logger.debug(`Saved ${role} message ${row.id} in conversation ${conversationId}`);
    return row;
  }

  async getRecentMessages(conversationId: string, limit = 10): Promise<Message[]> {
    return this.db.query<Message>(
      `SELECT * FROM (
         SELECT * FROM conversation_messages
         WHERE conversation_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       ) sub
       ORDER BY created_at ASC`,
      [conversationId, limit],
    );
  }
}
