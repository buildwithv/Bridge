import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ChunkingService } from './chunking.service';
import type { Database } from '../database/database.types';

type MessageEmbedding = Database['public']['Tables']['message_embeddings']['Row'];

export interface UploadResult {
  filename: string;
  totalChunks: number;
  chunkIds: string[];
  extractedPeople: string[];
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly chunking: ChunkingService,
  ) {}

  async processDocument(
    conversationId: string,
    userId: string,
    filename: string,
    content: string,
  ): Promise<UploadResult> {
    this.logger.log(`Processing document "${filename}" for user ${userId}`);

    const chunks = this.chunking.chunk(content);
    this.logger.debug(`Document split into ${chunks.length} chunks`);

    const chunkIds: string[] = [];

    for (const chunk of chunks) {
      const row = await this.db.queryOne<MessageEmbedding>(
        `INSERT INTO message_embeddings
           (user_id, content, source, metadata)
         VALUES ($1, $2, 'document', $3)
         RETURNING *`,
        [
          userId,
          chunk.content,
          JSON.stringify({
            conversationId,
            filename,
            chunkIndex: chunk.index,
            startChar: chunk.startChar,
            endChar: chunk.endChar,
          }),
        ],
      );

      if (row) chunkIds.push(row.id);
    }

    this.logger.log(`Stored ${chunkIds.length} chunks for document "${filename}"`);

    // Entity extraction runs as background pipeline (Phase 6)
    // For now return empty extractedPeople — will be populated when extraction pipeline is wired
    return {
      filename,
      totalChunks: chunks.length,
      chunkIds,
      extractedPeople: [],
    };
  }
}
