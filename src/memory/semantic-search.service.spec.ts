import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticSearchService } from './semantic-search.service';

const makeDb = () => ({ query: vi.fn(), queryOne: vi.fn() });

const makeEmbeddingService = (available = true) => ({
  isAvailable: vi.fn().mockReturnValue(available),
  generateEmbedding: vi.fn(),
});

const makeRow = (overrides = {}) => ({
  id: 'row-1',
  content: 'test content',
  source: 'message',
  similarity: 0.9,
  metadata: {},
  created_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

describe('SemanticSearchService', () => {
  let service: SemanticSearchService;
  let db: ReturnType<typeof makeDb>;
  let embeddingService: ReturnType<typeof makeEmbeddingService>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb();
    embeddingService = makeEmbeddingService();
    service = new SemanticSearchService(db as any, embeddingService as any);
  });

  describe('search', () => {
    it('runs vector query and maps results when embedding available', async () => {
      const vector = [0.1, 0.2];
      embeddingService.generateEmbedding.mockResolvedValue(vector);
      db.query.mockResolvedValue([makeRow({ similarity: 0.95 })]);

      const results = await service.search('user-1', 'find me something', 3);

      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBe(0.95);
      expect(results[0].source).toBe('message');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('<=>'),
        expect.arrayContaining(['user-1', 3]),
      );
    });

    it('falls back to recency when embedding service unavailable', async () => {
      embeddingService.isAvailable.mockReturnValue(false);
      db.query.mockResolvedValue([makeRow()]);

      const results = await service.search('user-1', 'query', 5);

      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBe(0);
      expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.arrayContaining(['user-1']),
      );
    });

    it('falls back to recency when generateEmbedding returns null', async () => {
      embeddingService.generateEmbedding.mockResolvedValue(null);
      db.query.mockResolvedValue([]);

      const results = await service.search('user-1', 'query');

      expect(results).toEqual([]);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array),
      );
    });

    it('applies source filter in vector query', async () => {
      embeddingService.generateEmbedding.mockResolvedValue([0.1]);
      db.query.mockResolvedValue([]);

      await service.search('user-1', 'query', 5, 'document');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("source = 'document'"),
        expect.any(Array),
      );
    });

    it('applies source filter in fallback query', async () => {
      embeddingService.isAvailable.mockReturnValue(false);
      db.query.mockResolvedValue([]);

      await service.search('user-1', 'query', 5, 'memory');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("source = 'memory'"),
        expect.any(Array),
      );
    });
  });

  describe('searchByPerson', () => {
    it('returns facts with relationship when person found', async () => {
      db.query.mockResolvedValue([
        { facts: ['has a dog', 'lives in NYC'], relationship: 'friend' },
      ]);

      const lines = await service.searchByPerson('user-1', 'Jake');

      expect(lines).toContain('Relationship: friend');
      expect(lines).toContain('has a dog');
      expect(lines).toContain('lives in NYC');
    });

    it('returns facts without relationship line when relationship is null', async () => {
      db.query.mockResolvedValue([{ facts: ['works at Google'], relationship: null }]);

      const lines = await service.searchByPerson('user-1', 'Marcus');

      expect(lines).not.toContain(expect.stringContaining('Relationship:'));
      expect(lines).toContain('works at Google');
    });

    it('returns empty array when person not found', async () => {
      db.query.mockResolvedValue([]);

      const lines = await service.searchByPerson('user-1', 'Unknown');

      expect(lines).toEqual([]);
    });

    it('handles non-array facts gracefully', async () => {
      db.query.mockResolvedValue([{ facts: null, relationship: null }]);

      const lines = await service.searchByPerson('user-1', 'Someone');

      expect(lines).toEqual([]);
    });
  });
});
