// Pre-computed fixture data — no live API calls needed in tests

export const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';
export const TEST_CONV_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const TEST_MSG_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// Static 768-dim vector (nomic-embed-text dimensions) — pre-computed, no Ollama needed
export const FIXTURE_VECTOR: number[] = Array.from({ length: 768 }, (_, i) =>
  Math.sin(i * 0.1) * 0.5,
);

export const FIXTURE_VECTOR_STR = `[${FIXTURE_VECTOR.join(',')}]`;

export const makeConversation = (overrides = {}) => ({
  id: TEST_CONV_ID,
  user_id: TEST_USER_ID,
  title: 'Test conversation',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

export const makeMessage = (overrides = {}) => ({
  id: TEST_MSG_ID,
  conversation_id: TEST_CONV_ID,
  user_id: TEST_USER_ID,
  role: 'user' as const,
  content: 'My friend Jake just started a company called ResumeAI.',
  metadata: {},
  created_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

export const makeEmbeddingRow = (overrides = {}) => ({
  id: 'emb-fixture-1',
  user_id: TEST_USER_ID,
  content: 'My friend Jake just started a company called ResumeAI.',
  embedding: FIXTURE_VECTOR_STR,
  source: 'message' as const,
  metadata: { conversationId: TEST_CONV_ID },
  created_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

export const makePerson = (overrides = {}) => ({
  id: 'person-fixture-1',
  user_id: TEST_USER_ID,
  name: 'Jake',
  relationship: 'friend',
  facts: ['started a company called ResumeAI'],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  last_mentioned_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

export const EXTRACT_RESPONSE = JSON.stringify({
  people: [
    {
      name: 'Jake',
      relationship: 'friend',
      facts: ['started a company called ResumeAI'],
    },
  ],
  topics: ['entrepreneurship'],
  emotionalTone: 'neutral',
  keyFacts: [],
});
