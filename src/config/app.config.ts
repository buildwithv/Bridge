export const AppConfig = {
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },
  llm: {
    provider: process.env.LLM_PROVIDER ?? 'anthropic',
    model: process.env.LLM_MODEL ?? 'claude-sonnet-4-6',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  },
  embedding: {
    model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS ?? '1536', 10),
  },
  memory: {
    topK: parseInt(process.env.MEMORY_TOP_K ?? '5', 10),
    chunkSize: parseInt(process.env.CHUNK_SIZE ?? '500', 10),
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP ?? '50', 10),
  },
} as const;
