-- Update embedding column to 768 dimensions for nomic-embed-text (Ollama)
-- Run this if you already ran 001_init.sql with 1536 dimensions

ALTER TABLE message_embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE message_embeddings ADD COLUMN embedding vector(768);

-- Recreate HNSW index with correct dimensions
DROP INDEX IF EXISTS message_embeddings_hnsw_idx;
CREATE INDEX message_embeddings_hnsw_idx
  ON message_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
