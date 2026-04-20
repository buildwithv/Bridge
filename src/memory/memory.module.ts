import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { SemanticSearchService } from './semantic-search.service';
import { ContextAssemblyService } from './context-assembly.service';

@Module({
  providers: [EmbeddingService, SemanticSearchService, ContextAssemblyService],
  exports: [EmbeddingService, SemanticSearchService, ContextAssemblyService],
})
export class MemoryModule {}
