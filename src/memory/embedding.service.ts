import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Embeddings } from '@langchain/core/embeddings';
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
    const model = this.config.getOrThrow<string>('EMBEDDING_MODEL');
    this.dimensions = this.config.get<number>('EMBEDDING_DIMENSIONS', 1536);

    // OpenAI embeddings — free alternative: use nomic-embed via Ollama
    this.embeddings = new OpenAIEmbeddings({
      model,
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
      dimensions: this.dimensions,
    });

    this.logger.log(`Embedding service initialized model=${model} dims=${this.dimensions}`);
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

    // Store even without embedding (graceful degradation — embedding column stays null)
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
