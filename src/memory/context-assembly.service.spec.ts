import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextAssemblyService } from './context-assembly.service';

const makeSearchResult = (overrides = {}) => ({
  id: 'r-1',
  content: 'User mentioned loving coffee',
  source: 'message' as const,
  similarity: 0.9,
  metadata: {},
  createdAt: '2025-01-01T00:00:00Z',
  ...overrides,
});

const makeConfig = () => ({
  get: vi.fn((key: string, def?: unknown) => {
    if (key === 'MEMORY_TOP_K') return 5;
    return def;
  }),
});

const makeSearch = () => ({
  search: vi.fn(),
  searchByPerson: vi.fn(),
});

describe('ContextAssemblyService', () => {
  let service: ContextAssemblyService;
  let semanticSearch: ReturnType<typeof makeSearch>;

  beforeEach(() => {
    vi.clearAllMocks();
    semanticSearch = makeSearch();
    service = new ContextAssemblyService(makeConfig() as any, semanticSearch as any);
  });

  describe('assembleContext', () => {
    it('returns default message when no results and no names', async () => {
      semanticSearch.search.mockResolvedValue([]);

      const ctx = await service.assembleContext('user-1', 'how are you?');

      expect(ctx).toBe('No prior context available yet.');
    });

    it('includes relevant memories section when search returns results', async () => {
      semanticSearch.search.mockResolvedValue([
        makeSearchResult({ content: 'User loves coffee' }),
      ]);
      semanticSearch.searchByPerson.mockResolvedValue([]);

      const ctx = await service.assembleContext('user-1', 'what do I like?');

      expect(ctx).toContain('## Relevant memories');
      expect(ctx).toContain('[Past conversation]');
      expect(ctx).toContain('User loves coffee');
    });

    it('labels document sources correctly', async () => {
      semanticSearch.search.mockResolvedValue([
        makeSearchResult({ source: 'document', content: 'Resume content here' }),
      ]);
      semanticSearch.searchByPerson.mockResolvedValue([]);

      const ctx = await service.assembleContext('user-1', 'about my resume');

      expect(ctx).toContain('[From document]');
    });

    it('appends person facts when names are detected in message', async () => {
      semanticSearch.search.mockResolvedValue([]);
      semanticSearch.searchByPerson.mockResolvedValue(['Relationship: friend', 'lives in NYC']);

      const ctx = await service.assembleContext('user-1', 'Tell me about Jake');

      expect(ctx).toContain('## What I know about Jake');
      expect(ctx).toContain('lives in NYC');
      expect(semanticSearch.searchByPerson).toHaveBeenCalledWith('user-1', 'Jake');
    });

    it('skips person section when no facts found', async () => {
      semanticSearch.search.mockResolvedValue([]);
      semanticSearch.searchByPerson.mockResolvedValue([]);

      const ctx = await service.assembleContext('user-1', 'Tell me about Jake');

      expect(ctx).toBe('No prior context available yet.');
    });

    it('filters stop words from name extraction', async () => {
      semanticSearch.search.mockResolvedValue([]);
      semanticSearch.searchByPerson.mockResolvedValue([]);

      await service.assembleContext('user-1', 'The cat sat on the mat');

      expect(semanticSearch.searchByPerson).not.toHaveBeenCalledWith('user-1', 'The');
    });

    it('combines memories and person facts with separator', async () => {
      semanticSearch.search.mockResolvedValue([makeSearchResult()]);
      semanticSearch.searchByPerson.mockResolvedValue(['fact about Marcus']);

      const ctx = await service.assembleContext('user-1', 'Marcus said hello');

      expect(ctx).toContain('## Relevant memories');
      expect(ctx).toContain('## What I know about Marcus');
      expect(ctx).toContain('---');
    });

    it('truncates long content to 300 chars', async () => {
      const longContent = 'a'.repeat(400);
      semanticSearch.search.mockResolvedValue([makeSearchResult({ content: longContent })]);
      semanticSearch.searchByPerson.mockResolvedValue([]);

      const ctx = await service.assembleContext('user-1', 'query');

      const memorySection = ctx.split('## Relevant memories')[1];
      expect(memorySection.length).toBeLessThan(longContent.length);
    });
  });
});
