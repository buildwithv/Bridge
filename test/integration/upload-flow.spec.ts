/**
 * Integration test: document upload flow
 * upload → chunk → embed → recall
 *
 * Uses pre-computed fixture vectors — no live API calls.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TEST_USER_ID,
  TEST_CONV_ID,
  FIXTURE_VECTOR,
  FIXTURE_VECTOR_STR,
  makeEmbeddingRow,
  makePerson,
  EXTRACT_RESPONSE,
} from '../fixtures';

// ── LangChain mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  embedQuery: vi.fn(),
  chainInvoke: vi.fn(),
  mockPipe: vi.fn(),
  graphInvoke: vi.fn(),
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
      compile: vi.fn().mockReturnValue({ invoke: mocks.graphInvoke }),
    })),
    END: '__end__',
    START: '__start__',
  };
});

// ── Service imports ──────────────────────────────────────────────────────────

import { ChunkingService } from '../../src/upload/chunking.service';
import { EmbeddingService } from '../../src/memory/embedding.service';
import { SemanticSearchService } from '../../src/memory/semantic-search.service';
import { EntityService } from '../../src/extraction/entity.service';
import { ExtractionGraph } from '../../src/extraction/extraction.graph';
import { UploadService } from '../../src/upload/upload.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeDb = () => ({ queryOne: vi.fn(), query: vi.fn() });
const makeConfig = (chunkSize = 500, chunkOverlap = 50) => ({
  get: vi.fn((key: string, def?: unknown) => {
    const map: Record<string, unknown> = {
      EMBEDDING_PROVIDER: 'ollama',
      EMBEDDING_DIMENSIONS: 768,
      OLLAMA_BASE_URL: 'http://localhost:11434',
      LLM_PROVIDER: 'groq',
      CHUNK_SIZE: chunkSize,
      CHUNK_OVERLAP: chunkOverlap,
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

const SAMPLE_DOCUMENT = `Jake Thompson is my closest friend from university.
He recently co-founded a startup called ResumeAI that uses machine learning to improve resumes.
Jake is originally from Vancouver and moved to San Francisco last year.

Marcus Chen is my tech lead at work.
He has very high standards and pushes the team hard.
Despite the pressure, I have learned a lot from working with him.

I have been journaling more lately to process my thoughts.
It helps me notice patterns in my mood and energy levels.`;

describe('Document upload flow integration: upload → chunk → embed → recall', () => {
  let db: ReturnType<typeof makeDb>;
  let config: ReturnType<typeof makeConfig>;
  let chunkingService: ChunkingService;
  let embeddingService: EmbeddingService;
  let semanticSearch: SemanticSearchService;
  let entityService: EntityService;
  let extractionGraph: ExtractionGraph;
  let uploadService: UploadService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockPipe.mockReturnValue({ invoke: mocks.chainInvoke });
    mocks.embedQuery.mockResolvedValue(FIXTURE_VECTOR);
    mocks.chainInvoke.mockResolvedValue({ content: EXTRACT_RESPONSE });
    mocks.graphInvoke.mockResolvedValue({ stored: true });

    db = makeDb();
    config = makeConfig();

    chunkingService = new ChunkingService(config as any);
    embeddingService = new EmbeddingService(config as any, db as any);
    semanticSearch = new SemanticSearchService(db as any, embeddingService);
    entityService = new EntityService(db as any);
    extractionGraph = new ExtractionGraph(config as any, entityService, embeddingService, db as any);
    uploadService = new UploadService(chunkingService, embeddingService, extractionGraph);
  });

  it('chunking service splits the document into multiple chunks', () => {
    const chunks = chunkingService.chunk(SAMPLE_DOCUMENT);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.content.length).toBeGreaterThan(0);
      expect(c.endChar).toBeGreaterThan(c.startChar);
    });
  });

  it('each chunk gets an embedding stored using the fixture vector', async () => {
    const chunks = chunkingService.chunk(SAMPLE_DOCUMENT);
    db.queryOne.mockResolvedValue({ id: 'emb-chunk-1' });

    for (const chunk of chunks) {
      await embeddingService.storeEmbedding(TEST_USER_ID, chunk.content, 'document', {
        conversationId: TEST_CONV_ID,
        chunkIndex: chunk.index,
      });
    }

    expect(mocks.embedQuery).toHaveBeenCalledTimes(chunks.length);
    expect(db.queryOne).toHaveBeenCalledTimes(chunks.length);
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO message_embeddings'),
      expect.arrayContaining([TEST_USER_ID, FIXTURE_VECTOR_STR, 'document']),
    );
  });

  it('processDocument returns correct chunk count and ids', async () => {
    db.queryOne.mockResolvedValue({ id: 'emb-chunk-x' });

    const result = await uploadService.processDocument(
      TEST_CONV_ID,
      TEST_USER_ID,
      'journal.txt',
      SAMPLE_DOCUMENT,
    );

    expect(result.filename).toBe('journal.txt');
    expect(result.totalChunks).toBeGreaterThan(0);
    expect(result.chunkIds.length).toBe(result.totalChunks);
    expect(result.chunkIds.every((id) => id === 'emb-chunk-x')).toBe(true);
  });

  it('extraction runs once per chunk (fire-and-forget)', async () => {
    db.queryOne.mockResolvedValue({ id: 'emb-chunk-1' });

    const chunks = chunkingService.chunk(SAMPLE_DOCUMENT);
    await uploadService.processDocument(
      TEST_CONV_ID,
      TEST_USER_ID,
      'journal.txt',
      SAMPLE_DOCUMENT,
    );

    // Give the fire-and-forget promises time to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(mocks.graphInvoke).toHaveBeenCalledTimes(chunks.length);
  });

  it('semantic search can find document content using fixture vector', async () => {
    const embRow = makeEmbeddingRow({ source: 'document', content: 'Jake started ResumeAI.' });
    db.query.mockResolvedValue([
      {
        id: embRow.id,
        content: embRow.content,
        source: 'document',
        similarity: 0.93,
        metadata: { conversationId: TEST_CONV_ID },
        created_at: embRow.created_at,
      },
    ]);

    const results = await semanticSearch.search(TEST_USER_ID, 'Tell me about startup', 5, 'document');

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('document');
    expect(results[0].content).toContain('ResumeAI');
    expect(results[0].similarity).toBe(0.93);
  });

  it('entity extraction can identify people from document chunks', async () => {
    // Simulate extractNode being called on a chunk
    mocks.chainInvoke.mockResolvedValue({ content: EXTRACT_RESPONSE });
    db.queryOne
      .mockResolvedValueOnce(null) // no existing person
      .mockResolvedValueOnce(makePerson()); // created person
    db.query.mockResolvedValue([]);

    const state = {
      userId: TEST_USER_ID,
      messageId: 'chunk-id-1',
      content: 'Jake Thompson co-founded ResumeAI.',
    };

    const extracted = await (extractionGraph as any).extractNode(state) as { extracted: { people: { name: string }[] } };

    expect(extracted.extracted).toBeDefined();
    expect(extracted.extracted.people).toHaveLength(1);
    expect(extracted.extracted.people[0].name).toBe('Jake');
  });

  it('graceful degradation — embedding failure does not break document upload', async () => {
    mocks.embedQuery.mockRejectedValue(new Error('Ollama not running'));
    db.queryOne.mockResolvedValue({ id: 'emb-null-vector' });

    const result = await uploadService.processDocument(
      TEST_CONV_ID,
      TEST_USER_ID,
      'notes.txt',
      'Short document without embeddings.',
    );

    // Upload should still complete — just stores null vectors
    expect(result.totalChunks).toBeGreaterThan(0);
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([null]),
    );
  });
});
