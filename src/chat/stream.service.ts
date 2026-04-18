import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Database } from '../database/database.types';

type Message = Database['public']['Tables']['conversation_messages']['Row'];

const SYSTEM_PROMPT = `You are Shirin, a deeply empathetic AI companion. Your purpose is to genuinely know and understand the user through conversation.

You have access to relevant memories and context from past conversations below. Use them naturally — reference specific facts, names, and details when relevant. If you don't know something about the user, say so honestly rather than guessing.

{memory_context}

Guidelines:
- Be warm, curious, and genuinely interested in the user's life
- Reference past conversations naturally ("You mentioned earlier that...")
- When someone is mentioned by name, draw on everything you know about them
- Acknowledge when you lack information rather than fabricating details
- Ask thoughtful follow-up questions to learn more`;

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private readonly model: BaseChatModel;

  constructor(private readonly config: ConfigService) {
    const provider = this.config.get<string>('LLM_PROVIDER', 'anthropic');
    const modelId = this.config.getOrThrow<string>('LLM_MODEL');

    if (provider === 'openai') {
      this.model = new ChatOpenAI({
        model: modelId,
        apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
        streaming: true,
      });
    } else {
      this.model = new ChatAnthropic({
        model: modelId,
        apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
        streaming: true,
      });
    }

    this.logger.log(`Stream service initialized with provider=${provider} model=${modelId}`);
  }

  async *streamResponse(
    userMessage: string,
    conversationHistory: Message[],
    memoryContext: string,
  ): AsyncGenerator<string> {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', SYSTEM_PROMPT],
      new MessagesPlaceholder('history'),
      ['human', '{input}'],
    ]);

    const history = this.buildHistory(conversationHistory);

    const chain = prompt.pipe(this.model);

    const stream = await chain.stream({
      memory_context: memoryContext || 'No prior context available yet.',
      history,
      input: userMessage,
    });

    for await (const chunk of stream) {
      const text = typeof chunk.content === 'string' ? chunk.content : '';
      if (text) yield text;
    }
  }

  private buildHistory(messages: Message[]): BaseMessage[] {
    return messages.map((msg) =>
      msg.role === 'user'
        ? new HumanMessage(msg.content)
        : new AIMessage(msg.content),
    );
  }
}
