import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OllamaEmbeddings } from '@langchain/ollama';
import { OpenAIEmbeddings } from '@langchain/openai';
import { CohereEmbeddings } from '@langchain/cohere';
import type { Embeddings } from '@langchain/core/embeddings';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly embeddings: Embeddings;
  private readonly dimensions: number;
  private available = true;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {
    const provider = this.config.get<string>('EMBEDDING_PROVIDER', 'ollama');
    const model = this.config.getOrThrow<string>('EMBEDDING_MODEL');
    this.dimensions = this.config.get<number>('EMBEDDING_DIMENSIONS', 768);

    if (provider === 'openai') {
      this.embeddings = new OpenAIEmbeddings({
        model,
        apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
        dimensions: this.dimensions,
      });
    } else if (provider === 'cohere') {
      this.embeddings = new CohereEmbeddings({
        model,
        apiKey: this.config.getOrThrow<string>('COHERE_API_KEY'),
      });
    } else {
      // Default: Ollama (free, local)
      this.embeddings = new OllamaEmbeddings({
        model,
        baseUrl: this.config.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434'),
      });
    }

    this.logger.log(`Embedding service initialized provider=${provider} model=${model} dims=${this.dimensions}`);
  }

  isAvailable(): boolean {
    return this.available;
  }

  async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      const vector = await this.embeddings.embedQuery(text);
      this.available = true;
      return vector;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Embedding generation failed (graceful degradation): ${msg}`);
      this.available = false;
      return null;
    }
  }

  async storeEmbedding(
    userId: string,
    content: string,
    source: 'message' | 'document' | 'memory',
    metadata: Record<string, unknown> = {},
    messageId?: string,
  ): Promise<string | null> {
    const vector = await this.generateEmbedding(content);

    const row = await this.db.queryOne<{ id: string }>(
      `INSERT INTO message_embeddings (user_id, content, embedding, source, metadata, message_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        userId,
        content,
        vector ? `[${vector.join(',')}]` : null,
        source,
        JSON.stringify(metadata),
        messageId ?? null,
      ],
    );

    return row?.id ?? null;
  }

  async updateEmbedding(embeddingId: string, content: string): Promise<void> {
    const vector = await this.generateEmbedding(content);
    if (!vector) return;

    await this.db.query(
      `UPDATE message_embeddings SET embedding = $1 WHERE id = $2`,
      [`[${vector.join(',')}]`, embeddingId],
    );
  }
}
