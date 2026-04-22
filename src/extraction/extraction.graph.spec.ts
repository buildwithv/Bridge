import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  chainInvoke: vi.fn(),
  mockPipe: vi.fn(),
  graphInvoke: vi.fn(),
}));

vi.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: vi.fn().mockReturnValue({
      pipe: mocks.mockPipe,
    }),
  },
}));

vi.mock('@langchain/groq', () => ({
  ChatGroq: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@langchain/langgraph', () => {
  const annotation = vi.fn().mockReturnValue({});
  Object.assign(annotation, { Root: vi.fn().mockReturnValue({}) });
  return {
    Annotation: annotation,
    StateGraph: vi.fn().mockImplementation(() => ({
      addNode: vi.fn().mockReturnThis(),
      addEdge: vi.fn().mockReturnThis(),
      addConditionalEdges: vi.fn().mockReturnThis(),
      compile: vi.fn().mockReturnValue({ invoke: mocks.graphInvoke }),
    })),
    END: '__end__',
    START: '__start__',
  };
});

import { ExtractionGraph } from './extraction.graph';

const makeConfig = () => ({
  get: vi.fn((key: string, def?: unknown) => {
    if (key === 'LLM_PROVIDER') return 'groq';
    return def;
  }),
  getOrThrow: vi.fn((key: string) => {
    const map: Record<string, string> = {
      LLM_MODEL: 'llama-3.3-70b-versatile',
      GROQ_API_KEY: 'test-key',
    };
    if (map[key]) return map[key];
    throw new Error(`Missing: ${key}`);
  }),
});

const makeEntityService = () => ({ upsertPerson: vi.fn() });
const makeEmbeddingService = () => ({ storeEmbedding: vi.fn() });
const makeDb = () => ({ query: vi.fn(), queryOne: vi.fn() });

const baseExtracted = {
  people: [],
  topics: [],
  emotionalTone: 'neutral' as const,
  keyFacts: [],
};

describe('ExtractionGraph', () => {
  let service: ExtractionGraph;
  let entityService: ReturnType<typeof makeEntityService>;
  let embeddingService: ReturnType<typeof makeEmbeddingService>;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockPipe.mockReturnValue({ invoke: mocks.chainInvoke });
    entityService = makeEntityService();
    embeddingService = makeEmbeddingService();
    db = makeDb();
    service = new ExtractionGraph(
      makeConfig() as any,
      entityService as any,
      embeddingService as any,
      db as any,
    );
  });

  describe('extractNode', () => {
    const state = { userId: 'u-1', messageId: 'msg-1', content: 'Jake started a company' };

    it('parses valid JSON from LLM response', async () => {
      const extracted = { ...baseExtracted, people: [{ name: 'Jake', relationship: null, facts: ['started a company'] }] };
      mocks.chainInvoke.mockResolvedValue({ content: JSON.stringify(extracted) });

      const result = await (service as any).extractNode(state) as { extracted: typeof extracted };

      expect(result.extracted).toEqual(extracted);
    });

    it('strips markdown code fences before parsing', async () => {
      const extracted = { ...baseExtracted };
      mocks.chainInvoke.mockResolvedValue({ content: '```json\n' + JSON.stringify(extracted) + '\n```' });

      const result = await (service as any).extractNode(state) as { extracted: typeof extracted };

      expect(result.extracted).toEqual(extracted);
    });

    it('returns error state when LLM call fails', async () => {
      mocks.chainInvoke.mockRejectedValue(new Error('API error'));

      const result = await (service as any).extractNode(state) as { error: string };

      expect(result.error).toBe('API error');
    });

    it('returns error state when response is not valid JSON', async () => {
      mocks.chainInvoke.mockResolvedValue({ content: 'not json at all' });

      const result = await (service as any).extractNode(state) as { error: string };

      expect(result.error).toBeDefined();
    });
  });

  describe('storeNode', () => {
    it('returns stored: false when extracted is undefined', async () => {
      const result = await (service as any).storeNode({ userId: 'u-1', extracted: undefined }) as { stored: boolean };
      expect(result.stored).toBe(false);
    });

    it('upserts people and stores embeddings for facts', async () => {
      entityService.upsertPerson.mockResolvedValue({ id: 'person-1' });
      embeddingService.storeEmbedding.mockResolvedValue('emb-1');
      db.query.mockResolvedValue([]);

      const state = {
        userId: 'u-1',
        messageId: 'msg-1',
        extracted: {
          ...baseExtracted,
          people: [{ name: 'Jake', relationship: 'friend', facts: ['moved to Berlin'] }],
        },
      };

      const result = await (service as any).storeNode(state) as { stored: boolean };

      expect(result.stored).toBe(true);
      expect(entityService.upsertPerson).toHaveBeenCalledWith('u-1', 'Jake', 'friend', ['moved to Berlin']);
      expect(embeddingService.storeEmbedding).toHaveBeenCalledTimes(1);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("'relationship'"),
        expect.arrayContaining(['u-1', 'person-1', 'emb-1']),
      );
    });

    it('skips embedding when person has no facts', async () => {
      entityService.upsertPerson.mockResolvedValue({ id: 'person-1' });

      const state = {
        userId: 'u-1',
        messageId: 'msg-1',
        extracted: {
          ...baseExtracted,
          people: [{ name: 'Jake', relationship: null, facts: [] }],
        },
      };

      await (service as any).storeNode(state);

      expect(embeddingService.storeEmbedding).not.toHaveBeenCalled();
    });

    it('stores key facts about the user', async () => {
      embeddingService.storeEmbedding.mockResolvedValue('emb-2');
      db.query.mockResolvedValue([]);

      const state = {
        userId: 'u-1',
        messageId: 'msg-1',
        extracted: { ...baseExtracted, keyFacts: ['User is a software engineer'] },
      };

      const result = await (service as any).storeNode(state) as { stored: boolean };

      expect(result.stored).toBe(true);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("'fact'"),
        expect.arrayContaining(['User is a software engineer']),
      );
    });
  });

  describe('run', () => {
    it('invokes the compiled graph with correct input', async () => {
      mocks.graphInvoke.mockResolvedValue({});

      await service.run('u-1', 'msg-1', 'hello world');

      expect(mocks.graphInvoke).toHaveBeenCalledWith({
        userId: 'u-1',
        messageId: 'msg-1',
        content: 'hello world',
      });
    });
  });
});
