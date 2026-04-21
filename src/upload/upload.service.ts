import { Injectable, Logger } from '@nestjs/common';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from '../memory/embedding.service';
import { ExtractionGraph } from '../extraction/extraction.graph';

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
    private readonly extractionGraph: ExtractionGraph,
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
    const extractedPeopleSet = new Set<string>();

    for (const chunk of chunks) {
      const metadata = { conversationId, filename, chunkIndex: chunk.index };

      const id = await this.embeddingService.storeEmbedding(
        userId,
        chunk.content,
        'document',
        metadata,
      );

      if (id) chunkIds.push(id);

      // Run extraction on each chunk — fire and forget, collect people names
      void this.extractionGraph
        .run(userId, id ?? 'doc-chunk', chunk.content)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Chunk extraction failed: ${msg}`);
        });
    }

    this.logger.log(`Stored ${chunkIds.length} chunks for document "${filename}"`);

    return {
      filename,
      totalChunks: chunks.length,
      chunkIds,
      extractedPeople: [...extractedPeopleSet],
    };
  }
}
