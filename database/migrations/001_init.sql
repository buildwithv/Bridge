-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- conversations
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- conversation_messages
CREATE TABLE IF NOT EXISTS conversation_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- people
CREATE TABLE IF NOT EXISTS people (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL,
  name                TEXT NOT NULL,
  relationship        TEXT,
  facts               JSONB NOT NULL DEFAULT '[]',
  first_mentioned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_mentioned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- message_embeddings (dimensions = 1536 for text-embedding-3-small)
CREATE TABLE IF NOT EXISTS message_embeddings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id  UUID REFERENCES conversation_messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  content     TEXT NOT NULL,
  embedding   vector(1536),
  source      TEXT NOT NULL DEFAULT 'message' CHECK (source IN ('message', 'document', 'memory')),
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS message_embeddings_hnsw_idx
  ON message_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- memory_entries
CREATE TABLE IF NOT EXISTS memory_entries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL,
  content       TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('fact', 'preference', 'relationship', 'emotion')),
  entity_id     UUID REFERENCES people(id) ON DELETE SET NULL,
  embedding_id  UUID REFERENCES message_embeddings(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON conversation_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_user_id ON message_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_source ON message_embeddings(source);
CREATE INDEX IF NOT EXISTS idx_people_user_id ON people(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_user_id ON memory_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_entity_id ON memory_entries(entity_id);

-- updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_people_updated_at
  BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row-Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies scoped to user_id
CREATE POLICY conversations_user_policy ON conversations
  USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY messages_user_policy ON conversation_messages
  USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY embeddings_user_policy ON message_embeddings
  USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY people_user_policy ON people
  USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY memory_user_policy ON memory_entries
  USING (user_id = current_setting('app.current_user_id')::UUID);
