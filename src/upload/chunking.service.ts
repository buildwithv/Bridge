import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DocumentChunk {
  content: string;
  index: number;
  startChar: number;
  endChar: number;
}

@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(private readonly config: ConfigService) {
    this.chunkSize = this.config.get<number>('CHUNK_SIZE', 500);
    this.chunkOverlap = this.config.get<number>('CHUNK_OVERLAP', 50);
  }

  chunk(text: string): DocumentChunk[] {
    const normalized = text.replace(/\r\n/g, '\n').trim();

    // Try paragraph-based splitting first
    const paragraphChunks = this.splitByParagraphs(normalized);
    if (paragraphChunks.length > 1) {
      this.logger.debug(`Split document into ${paragraphChunks.length} paragraph chunks`);
      return paragraphChunks;
    }

    // Fallback to fixed-size splitting with overlap
    const fixedChunks = this.splitBySize(normalized);
    this.logger.debug(`Split document into ${fixedChunks.length} fixed-size chunks`);
    return fixedChunks;
  }

  private splitByParagraphs(text: string): DocumentChunk[] {
    const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const chunks: DocumentChunk[] = [];
    let currentChunk = '';
    let chunkStart = 0;
    let charPos = 0;

    for (const para of paragraphs) {
      const candidate = currentChunk ? `${currentChunk}\n\n${para}` : para;

      if (candidate.length > this.chunkSize && currentChunk) {
        chunks.push({
          content: currentChunk,
          index: chunks.length,
          startChar: chunkStart,
          endChar: chunkStart + currentChunk.length,
        });
        // Start new chunk with overlap from end of previous
        const overlap = currentChunk.slice(-this.chunkOverlap);
        chunkStart = chunkStart + currentChunk.length - overlap.length;
        currentChunk = overlap ? `${overlap}\n\n${para}` : para;
      } else {
        currentChunk = candidate;
      }

      charPos += para.length + 2;
    }

    if (currentChunk) {
      chunks.push({
        content: currentChunk,
        index: chunks.length,
        startChar: chunkStart,
        endChar: chunkStart + currentChunk.length,
      });
    }

    return chunks;
  }

  private splitBySize(text: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + this.chunkSize, text.length);
      chunks.push({
        content: text.slice(start, end),
        index: chunks.length,
        startChar: start,
        endChar: end,
      });
      start += this.chunkSize - this.chunkOverlap;
    }

    return chunks;
  }
}
