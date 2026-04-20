import { Injectable, Logger } from '@nestjs/common';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from '../memory/embedding.service';

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
    private readonly chunking: ChunkingService,
    private readonly embeddingService: EmbeddingService,
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
      const metadata = {
        conversationId,
        filename,
        chunkIndex: chunk.index,
        startChar: chunk.startChar,
        endChar: chunk.endChar,
      };

      // storeEmbedding handles graceful degradation (stores null embedding if API down)
      const id = await this.embeddingService.storeEmbedding(
        userId,
        chunk.content,
        'document',
        metadata,
      );

      if (id) chunkIds.push(id);
    }

    this.logger.log(`Stored ${chunkIds.length} chunks for document "${filename}"`);

    // Entity extraction runs as background pipeline (Phase 6 — LangGraph)
    return {
      filename,
      totalChunks: chunks.length,
      chunkIds,
      extractedPeople: [],
    };
  }
}
