import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SemanticSearchService } from './semantic-search.service';

@Injectable()
export class ContextAssemblyService {
  private readonly logger = new Logger(ContextAssemblyService.name);
  private readonly topK: number;

  // Regex to detect person names mentioned in a message (capitalized words not at sentence start)
  private static readonly NAME_PATTERN = /\b([A-Z][a-z]{1,20})\b/g;

  constructor(
    private readonly config: ConfigService,
    private readonly semanticSearch: SemanticSearchService,
  ) {
    this.topK = this.config.get<number>('MEMORY_TOP_K', 5);
  }

  async assembleContext(userId: string, userMessage: string): Promise<string> {
    const parts: string[] = [];

    // 1. Semantic search over all embeddings (messages + documents)
    const results = await this.semanticSearch.search(userId, userMessage, this.topK);

    if (results.length > 0) {
      const memoryLines = results
        .map((r) => {
          const sourceLabel = r.source === 'document' ? '[From document]' : '[Past conversation]';
          return `${sourceLabel} ${r.content.slice(0, 300)}`;
        })
        .join('\n\n');

      parts.push(`## Relevant memories\n${memoryLines}`);
    }

    // 2. If any person names are mentioned, fetch their known facts
    const names = this.extractNames(userMessage);
    for (const name of names) {
      const facts = await this.semanticSearch.searchByPerson(userId, name);
      if (facts.length > 0) {
        parts.push(`## What I know about ${name}\n${facts.join('\n')}`);
      }
    }

    if (parts.length === 0) {
      return 'No prior context available yet.';
    }

    const context = parts.join('\n\n---\n\n');
    this.logger.debug(`Assembled context (${context.length} chars) for userId=${userId}`);
    return context;
  }

  private extractNames(text: string): string[] {
    const matches = text.match(ContextAssemblyService.NAME_PATTERN) ?? [];
    // Filter out common sentence-starting words and short matches
    const stopWords = new Set([
      'I', 'The', 'A', 'An', 'My', 'Your', 'We', 'He', 'She', 'They',
      'It', 'This', 'That', 'What', 'Who', 'How', 'Can', 'Do', 'Did',
    ]);
    return [...new Set(matches.filter((m) => !stopWords.has(m)))];
  }
}
