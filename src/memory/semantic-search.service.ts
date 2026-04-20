import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EmbeddingService } from './embedding.service';

export interface SearchResult {
  id: string;
  content: string;
  source: 'message' | 'document' | 'memory';
  similarity: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

@Injectable()
export class SemanticSearchService {
  private readonly logger = new Logger(SemanticSearchService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async search(
    userId: string,
    query: string,
    topK = 5,
    source?: 'message' | 'document' | 'memory',
  ): Promise<SearchResult[]> {
    // Graceful degradation — fall back to recency if embedding unavailable
    if (!this.embeddingService.isAvailable()) {
      this.logger.warn('Embedding unavailable — using recency-based fallback');
      return this.recentFallback(userId, topK, source);
    }

    const vector = await this.embeddingService.generateEmbedding(query);
    if (!vector) return this.recentFallback(userId, topK, source);

    const sourceFilter = source ? `AND source = '${source}'` : '';

    const rows = await this.db.query<{
      id: string;
      content: string;
      source: string;
      similarity: number;
      metadata: Record<string, unknown>;
      created_at: string;
    }>(
      `SELECT
         id,
         content,
         source,
         1 - (embedding <=> $1::vector) AS similarity,
         metadata,
         created_at
       FROM message_embeddings
       WHERE user_id = $2
         AND embedding IS NOT NULL
         ${sourceFilter}
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [`[${vector.join(',')}]`, userId, topK],
    );

    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      source: r.source as SearchResult['source'],
      similarity: r.similarity,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
  }

  async searchByPerson(userId: string, personName: string): Promise<string[]> {
    const rows = await this.db.query<{ facts: unknown; relationship: string | null }>(
      `SELECT facts, relationship FROM people
       WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
      [userId, personName],
    );

    if (!rows.length) return [];

    const row = rows[0];
    const facts = Array.isArray(row.facts) ? (row.facts as string[]) : [];
    const lines: string[] = [];

    if (row.relationship) lines.push(`Relationship: ${row.relationship}`);
    lines.push(...facts);

    return lines;
  }

  private async recentFallback(
    userId: string,
    limit: number,
    source?: string,
  ): Promise<SearchResult[]> {
    const sourceFilter = source ? `AND source = '${source}'` : '';

    const rows = await this.db.query<{
      id: string;
      content: string;
      source: string;
      metadata: Record<string, unknown>;
      created_at: string;
    }>(
      `SELECT id, content, source, metadata, created_at
       FROM message_embeddings
       WHERE user_id = $1 ${sourceFilter}
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );

    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      source: r.source as SearchResult['source'],
      similarity: 0,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
  }
}
