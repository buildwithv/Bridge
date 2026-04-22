import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService } from './embedding.service';

const mocks = vi.hoisted(() => ({
  embedQuery: vi.fn(),
}));

vi.mock('@langchain/ollama', () => ({
  OllamaEmbeddings: vi.fn().mockImplementation(() => ({ embedQuery: mocks.embedQuery })),
}));
vi.mock('@langchain/openai', () => ({ OpenAIEmbeddings: vi.fn() }));
vi.mock('@langchain/cohere', () => ({ CohereEmbeddings: vi.fn() }));

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  get: vi.fn((key: string, def?: unknown) => {
    const map: Record<string, unknown> = {
      EMBEDDING_PROVIDER: 'ollama',
      EMBEDDING_DIMENSIONS: 768,
      OLLAMA_BASE_URL: 'http://localhost:11434',
      ...overrides,
    };
    return map[key] ?? def;
  }),
  getOrThrow: vi.fn((key: string) => {
    if (key === 'EMBEDDING_MODEL') return 'nomic-embed-text';
    throw new Error(`Missing config: ${key}`);
  }),
});

const makeDb = () => ({
  queryOne: vi.fn(),
  query: vi.fn(),
});

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb();
    service = new EmbeddingService(makeConfig() as any, db as any);
  });

  describe('isAvailable', () => {
    it('returns true initially', () => {
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('generateEmbedding', () => {
    it('returns vector on success and marks available', async () => {
      const vector = [0.1, 0.2, 0.3];
      mocks.embedQuery.mockResolvedValue(vector);

      const result = await service.generateEmbedding('hello');

      expect(result).toEqual(vector);
      expect(service.isAvailable()).toBe(true);
    });

    it('returns null and marks unavailable on failure', async () => {
      mocks.embedQuery.mockRejectedValue(new Error('Ollama down'));

      const result = await service.generateEmbedding('hello');

      expect(result).toBeNull();
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('storeEmbedding', () => {
    it('inserts row with vector and returns id', async () => {
      mocks.embedQuery.mockResolvedValue([0.1, 0.2]);
      db.queryOne.mockResolvedValue({ id: 'emb-1' });

      const id = await service.storeEmbedding('user-1', 'content', 'message', {}, 'msg-1');

      expect(id).toBe('emb-1');
      expect(db.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO message_embeddings'),
        expect.arrayContaining(['user-1', 'content', '[0.1,0.2]', 'message']),
      );
    });

    it('inserts row with null vector when embedding fails', async () => {
      mocks.embedQuery.mockRejectedValue(new Error('fail'));
      db.queryOne.mockResolvedValue({ id: 'emb-2' });

      const id = await service.storeEmbedding('user-1', 'content', 'document');

      expect(id).toBe('emb-2');
      const call = db.queryOne.mock.calls[0] as unknown[][];
      const params = call[1] as unknown[];
      expect(params[2]).toBeNull();
    });

    it('returns null when db insert returns no row', async () => {
      mocks.embedQuery.mockResolvedValue([0.1]);
      db.queryOne.mockResolvedValue(null);

      const id = await service.storeEmbedding('user-1', 'content', 'memory');

      expect(id).toBeNull();
    });
  });

  describe('updateEmbedding', () => {
    it('updates the embedding vector in DB', async () => {
      mocks.embedQuery.mockResolvedValue([0.5, 0.6]);
      db.query = vi.fn().mockResolvedValue([]);

      await service.updateEmbedding('emb-1', 'new content');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE message_embeddings'),
        expect.arrayContaining(['[0.5,0.6]', 'emb-1']),
      );
    });

    it('skips update when embedding returns null', async () => {
      mocks.embedQuery.mockRejectedValue(new Error('fail'));
      db.query = vi.fn();

      await service.updateEmbedding('emb-1', 'new content');

      expect(db.query).not.toHaveBeenCalled();
    });
  });
});
