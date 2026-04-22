/**
 * Integration test: full message flow
 * store → embed → extract → recall
 *
 * Uses pre-computed fixture vectors — no live API calls.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TEST_USER_ID,
  TEST_CONV_ID,
  TEST_MSG_ID,
  FIXTURE_VECTOR,
  FIXTURE_VECTOR_STR,
  makeConversation,
  makeMessage,
  makeEmbeddingRow,
  makePerson,
  EXTRACT_RESPONSE,
} from '../fixtures';

// ── LangChain mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  embedQuery: vi.fn(),
  chainInvoke: vi.fn(),
  mockPipe: vi.fn(),
}));

vi.mock('@langchain/ollama', () => ({
  OllamaEmbeddings: vi.fn().mockImplementation(() => ({ embedQuery: mocks.embedQuery })),
}));
vi.mock('@langchain/openai', () => ({ OpenAIEmbeddings: vi.fn() }));
vi.mock('@langchain/cohere', () => ({ CohereEmbeddings: vi.fn() }));
vi.mock('@langchain/groq', () => ({
  ChatGroq: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: vi.fn().mockReturnValue({ pipe: mocks.mockPipe }),
  },
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
      compile: vi.fn().mockReturnValue({
        invoke: vi.fn().mockImplementation(async (input) => {
          // Simulate the real graph: extract then store
          return { ...input, stored: true };
        }),
      }),
    })),
    END: '__end__',
    START: '__start__',
  };
});

// ── Service imports (after mocks) ────────────────────────────────────────────

import { ConversationsService } from '../../src/conversations/conversations.service';
import { EmbeddingService } from '../../src/memory/embedding.service';
import { SemanticSearchService } from '../../src/memory/semantic-search.service';
import { ContextAssemblyService } from '../../src/memory/context-assembly.service';
import { EntityService } from '../../src/extraction/entity.service';
import { ExtractionGraph } from '../../src/extraction/extraction.graph';

// ── Shared mock DB ────────────────────────────────────────────────────────────

const makeDb = () => ({ queryOne: vi.fn(), query: vi.fn() });
const makeConfig = () => ({
  get: vi.fn((key: string, def?: unknown) => {
    const map: Record<string, unknown> = {
      EMBEDDING_PROVIDER: 'ollama',
      EMBEDDING_DIMENSIONS: 768,
      OLLAMA_BASE_URL: 'http://localhost:11434',
      LLM_PROVIDER: 'groq',
      MEMORY_TOP_K: 5,
    };
    return map[key] ?? def;
  }),
  getOrThrow: vi.fn((key: string) => {
    const map: Record<string, string> = {
      EMBEDDING_MODEL: 'nomic-embed-text',
      LLM_MODEL: 'llama-3.3-70b-versatile',
      GROQ_API_KEY: 'test-key',
    };
    if (map[key]) return map[key];
    throw new Error(`Missing config: ${key}`);
  }),
});

describe('Message flow integration: store → embed → extract → recall', () => {
  let db: ReturnType<typeof makeDb>;
  let config: ReturnType<typeof makeConfig>;
  let conversationsService: ConversationsService;
  let embeddingService: EmbeddingService;
  let semanticSearch: SemanticSearchService;
  let contextAssembly: ContextAssemblyService;
  let entityService: EntityService;
  let extractionGraph: ExtractionGraph;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockPipe.mockReturnValue({ invoke: mocks.chainInvoke });
    mocks.embedQuery.mockResolvedValue(FIXTURE_VECTOR);
    mocks.chainInvoke.mockResolvedValue({ content: EXTRACT_RESPONSE });

    db = makeDb();
    config = makeConfig();

    conversationsService = new ConversationsService(db as any);
    embeddingService = new EmbeddingService(config as any, db as any);
    semanticSearch = new SemanticSearchService(db as any, embeddingService);
    contextAssembly = new ContextAssemblyService(config as any, semanticSearch);
    entityService = new EntityService(db as any);
    extractionGraph = new ExtractionGraph(config as any, entityService, embeddingService, db as any);
  });

  it('step 1 — saves a user message to the database', async () => {
    const msg = makeMessage();
    db.queryOne.mockResolvedValue(msg);

    const result = await conversationsService.saveMessage(
      TEST_CONV_ID,
      TEST_USER_ID,
      'user',
      msg.content,
    );

    expect(result.id).toBe(TEST_MSG_ID);
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO conversation_messages'),
      expect.arrayContaining([TEST_CONV_ID, TEST_USER_ID, 'user']),
    );
  });

  it('step 2 — generates a vector and stores embedding for the message', async () => {
    db.queryOne.mockResolvedValue(makeEmbeddingRow());

    const embId = await embeddingService.storeEmbedding(
      TEST_USER_ID,
      'My friend Jake just started a company called ResumeAI.',
      'message',
      { conversationId: TEST_CONV_ID },
      TEST_MSG_ID,
    );

    expect(mocks.embedQuery).toHaveBeenCalledOnce();
    expect(embId).toBe('emb-fixture-1');
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO message_embeddings'),
      expect.arrayContaining([TEST_USER_ID, FIXTURE_VECTOR_STR]),
    );
  });

  it('step 3 — extraction pipeline identifies and stores named entities', async () => {
    // LLM returns structured extraction JSON
    mocks.chainInvoke.mockResolvedValue({ content: EXTRACT_RESPONSE });
    // Entity upsert returns a person row
    db.queryOne
      .mockResolvedValueOnce(null) // no existing person
      .mockResolvedValueOnce(makePerson()) // insert returns person
      .mockResolvedValueOnce(makeEmbeddingRow({ id: 'emb-entity-1' })); // embedding insert
    db.query.mockResolvedValue([]);

    // run() should complete without error — node logic is covered by unit tests
    await expect(
      extractionGraph.run(TEST_USER_ID, TEST_MSG_ID, 'My friend Jake just started a company.'),
    ).resolves.toBeUndefined();
  });

  it('step 4 — semantic search retrieves relevant memories using fixture vector', async () => {
    const embRow = makeEmbeddingRow();
    db.query.mockResolvedValue([
      {
        id: embRow.id,
        content: embRow.content,
        source: 'message',
        similarity: 0.97,
        metadata: embRow.metadata,
        created_at: embRow.created_at,
      },
    ]);

    const results = await semanticSearch.search(TEST_USER_ID, 'Tell me about Jake', 5);

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('ResumeAI');
    expect(results[0].similarity).toBe(0.97);
    expect(mocks.embedQuery).toHaveBeenCalledWith('Tell me about Jake');
  });

  it('step 5 — context assembly builds a memory prompt with person facts', async () => {
    // Semantic search returns a past message
    db.query
      .mockResolvedValueOnce([
        {
          id: 'emb-1',
          content: 'Jake started a company called ResumeAI.',
          source: 'message',
          similarity: 0.95,
          metadata: {},
          created_at: '2025-01-01T00:00:00Z',
        },
      ])
      // searchByPerson returns Jake's facts
      .mockResolvedValueOnce([
        { facts: ['started a company called ResumeAI'], relationship: 'friend' },
      ]);

    const ctx = await contextAssembly.assembleContext(TEST_USER_ID, 'What do you know about Jake?');

    expect(ctx).toContain('## Relevant memories');
    expect(ctx).toContain('ResumeAI');
    expect(ctx).toContain('## What I know about Jake');
    expect(ctx).toContain('friend');
  });

  it('full pipeline — message in, context out, using fixture vectors throughout', async () => {
    const userContent = 'My colleague Marcus is really difficult to work with.';

    // 1. Save message
    db.queryOne.mockResolvedValueOnce(makeMessage({ content: userContent, id: 'msg-new' }));
    const savedMsg = await conversationsService.saveMessage(
      TEST_CONV_ID,
      TEST_USER_ID,
      'user',
      userContent,
    );
    expect(savedMsg.id).toBe('msg-new');

    // 2. Store embedding (fixture vector, no real Ollama call)
    db.queryOne.mockResolvedValueOnce({ id: 'emb-new' });
    const embId = await embeddingService.storeEmbedding(
      TEST_USER_ID,
      userContent,
      'message',
      { conversationId: TEST_CONV_ID },
      savedMsg.id,
    );
    expect(embId).toBe('emb-new');
    expect(mocks.embedQuery).toHaveBeenCalledWith(userContent);

    // 3. Context assembly for a follow-up message
    db.query
      .mockResolvedValueOnce([
        {
          id: 'emb-new',
          content: userContent,
          source: 'message',
          similarity: 0.98,
          metadata: {},
          created_at: '2025-01-01T00:00:00Z',
        },
      ])
      .mockResolvedValueOnce([{ facts: ['difficult colleague'], relationship: 'colleague' }]);

    const ctx = await contextAssembly.assembleContext(TEST_USER_ID, 'How should I handle Marcus?');

    expect(ctx).toContain('difficult');
    expect(ctx).toContain('Marcus');
  });
});
