import { Module } from '@nestjs/common';
import { ExtractionGraph } from './extraction.graph';
import { EntityService } from './entity.service';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [MemoryModule],
  providers: [ExtractionGraph, EntityService],
  exports: [ExtractionGraph, EntityService],
})
export class ExtractionModule {}
