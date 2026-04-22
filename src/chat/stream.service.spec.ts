import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  chainStream: vi.fn(),
  mockPipe: vi.fn(),
}));

vi.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: vi.fn().mockReturnValue({ pipe: mocks.mockPipe }),
  },
  MessagesPlaceholder: vi.fn().mockImplementation((key: string) => ({ key })),
}));

vi.mock('@langchain/core/messages', () => ({
  HumanMessage: vi.fn().mockImplementation((content: string) => ({ _type: 'human', content })),
  AIMessage: vi.fn().mockImplementation((content: string) => ({ _type: 'ai', content })),
  BaseMessage: vi.fn(),
}));

vi.mock('@langchain/groq', () => ({
  ChatGroq: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation(() => ({})),
}));

import { StreamService } from './stream.service';

const makeConfig = (provider = 'groq') => ({
  get: vi.fn((key: string, def?: unknown) => {
    if (key === 'LLM_PROVIDER') return provider;
    return def;
  }),
  getOrThrow: vi.fn((key: string) => {
    const map: Record<string, string> = {
      LLM_MODEL: 'llama-3.3-70b-versatile',
      GROQ_API_KEY: 'test-groq-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
    };
    if (map[key]) return map[key];
    throw new Error(`Missing: ${key}`);
  }),
});

async function* makeChunks(texts: string[]) {
  for (const text of texts) {
    yield { content: text };
  }
}

describe('StreamService', () => {
  let service: StreamService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockPipe.mockReturnValue({ stream: mocks.chainStream });
    service = new StreamService(makeConfig() as any);
  });

  describe('streamResponse', () => {
    it('yields text chunks from model stream', async () => {
      mocks.chainStream.mockResolvedValue(makeChunks(['Hello', ' world', '!']));

      const chunks: string[] = [];
      for await (const chunk of service.streamResponse('hi', [], 'no context')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' world', '!']);
    });

    it('skips empty chunks', async () => {
      mocks.chainStream.mockResolvedValue(makeChunks(['Hello', '', ' world']));

      const chunks: string[] = [];
      for await (const chunk of service.streamResponse('hi', [], '')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' world']);
    });

    it('passes memory context and history to chain', async () => {
      mocks.chainStream.mockResolvedValue(makeChunks([]));

      const history = [
        { id: '1', role: 'user', content: 'previous message', conversation_id: 'c-1', created_at: '' },
        { id: '2', role: 'assistant', content: 'previous reply', conversation_id: 'c-1', created_at: '' },
      ];

      for await (const _ of service.streamResponse('new message', history as any, 'memory ctx')) {
        // consume
      }

      expect(mocks.chainStream).toHaveBeenCalledWith(
        expect.objectContaining({
          input: 'new message',
          memory_context: 'memory ctx',
        }),
      );
    });

    it('uses default context message when memoryContext is empty', async () => {
      mocks.chainStream.mockResolvedValue(makeChunks([]));

      for await (const _ of service.streamResponse('hi', [], '')) {
        // consume
      }

      expect(mocks.chainStream).toHaveBeenCalledWith(
        expect.objectContaining({
          memory_context: 'No prior context available yet.',
        }),
      );
    });

    it('handles non-string chunk content', async () => {
      async function* mixed() {
        yield { content: 'valid' };
        yield { content: ['array', 'content'] };
        yield { content: 'also valid' };
      }
      mocks.chainStream.mockResolvedValue(mixed());

      const chunks: string[] = [];
      for await (const chunk of service.streamResponse('hi', [], '')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['valid', 'also valid']);
    });
  });

  describe('provider selection', () => {
    it('initializes with anthropic provider without error', () => {
      expect(() => new StreamService(makeConfig('anthropic') as any)).not.toThrow();
    });
  });
});
