import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { ChunkingService } from './chunking.service';

const makeConfig = (chunkSize = 500, chunkOverlap = 50) => ({
  get: (key: string, def?: unknown) => {
    if (key === 'CHUNK_SIZE') return chunkSize;
    if (key === 'CHUNK_OVERLAP') return chunkOverlap;
    return def;
  },
});

describe('ChunkingService', () => {
  let service: ChunkingService;

  beforeEach(() => {
    service = new ChunkingService(makeConfig() as any);
  });

  describe('chunk — paragraph splitting', () => {
    it('returns a single chunk for short text', () => {
      const chunks = service.chunk('Hello world');
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('Hello world');
      expect(chunks[0].index).toBe(0);
    });

    it('splits text into multiple chunks at double newlines', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const chunks = service.chunk(text);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      chunks.forEach((c, i) => expect(c.index).toBe(i));
    });

    it('normalises Windows line endings', () => {
      const chunks = service.chunk('Para one.\r\n\r\nPara two.');
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].content).not.toContain('\r');
    });

    it('sets correct startChar and endChar on chunks', () => {
      const chunks = service.chunk('Short text');
      expect(chunks[0].startChar).toBe(0);
      expect(chunks[0].endChar).toBe('Short text'.length);
    });

    it('groups small paragraphs together up to chunkSize', () => {
      const smallParas = Array.from({ length: 5 }, (_, i) => `Para ${i}.`).join('\n\n');
      const chunks = service.chunk(smallParas);
      expect(chunks.length).toBeLessThan(5);
    });
  });

  describe('chunk — fixed-size fallback', () => {
    it('falls back to size splitting for long single-paragraph text', () => {
      const longText = 'word '.repeat(300);
      const chunks = service.chunk(longText);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('applies overlap between fixed-size chunks', () => {
      const smallService = new ChunkingService(makeConfig(20, 5) as any);
      const chunks = smallService.chunk('abcdefghijklmnopqrstuvwxyz1234567890');
      expect(chunks.length).toBeGreaterThan(1);
      // Second chunk should start before end of first due to overlap
      expect(chunks[1].startChar).toBeLessThan(chunks[0].endChar);
    });

    it('last fixed chunk ends at text length', () => {
      const smallService = new ChunkingService(makeConfig(10, 2) as any);
      const text = 'abcdefghijklmnopqrstuvwxyz';
      const chunks = smallService.chunk(text);
      const last = chunks[chunks.length - 1];
      expect(last.endChar).toBe(text.length);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty string', () => {
      const chunks = service.chunk('');
      expect(chunks).toHaveLength(0);
    });

    it('strips leading and trailing whitespace', () => {
      const chunks = service.chunk('  hello world  ');
      expect(chunks[0].content).toBe('hello world');
    });
  });
});
