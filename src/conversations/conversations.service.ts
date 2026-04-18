import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { Database, Json } from '../database/database.types';

type Conversation = Database['public']['Tables']['conversations']['Row'];
type Message = Database['public']['Tables']['conversation_messages']['Row'];

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(private readonly db: DatabaseService) {}

  async create(userId: string, title?: string): Promise<Conversation> {
    const { data, error } = await this.db.db
      .from('conversations')
      .insert({ user_id: userId, title: title ?? null })
      .select()
      .single();

    if (error) throw new Error(`Failed to create conversation: ${error.message}`);
    return data;
  }

  async findOne(conversationId: string, userId: string): Promise<Conversation> {
    const { data, error } = await this.db.db
      .from('conversations')
      .select()
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException(`Conversation ${conversationId} not found`);
    return data;
  }

  async findAll(userId: string): Promise<Conversation[]> {
    const { data, error } = await this.db.db
      .from('conversations')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch conversations: ${error.message}`);
    return data ?? [];
  }

  async saveMessage(
    conversationId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata: Json = {},
  ): Promise<Message> {
    const { data, error } = await this.db.db
      .from('conversation_messages')
      .insert({ conversation_id: conversationId, user_id: userId, role, content, metadata })
      .select()
      .single();

    if (error) throw new Error(`Failed to save message: ${error.message}`);

    this.logger.debug(`Saved ${role} message ${data.id} in conversation ${conversationId}`);
    return data;
  }

  async getRecentMessages(conversationId: string, limit = 10): Promise<Message[]> {
    const { data, error } = await this.db.db
      .from('conversation_messages')
      .select()
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
    return (data ?? []).reverse();
  }
}
