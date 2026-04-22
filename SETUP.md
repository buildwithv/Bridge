# Know Me — Setup & Architecture Guide

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22+ | |
| pnpm | 9+ | `npm install -g pnpm` |
| Docker Desktop | any | For PostgreSQL + pgvector |
| Ollama | any | For local embeddings — [ollama.ai](https://ollama.ai) |
| Groq API key | — | Free at [console.groq.com](https://console.groq.com) |

---

## Quick Start

### 1. Clone and install dependencies

```bash
git clone https://github.com/buildwithv/Bridge.git
cd Bridge
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your Groq API key:
```
GROQ_API_KEY=your_groq_key_here
```

All other defaults work out of the box.

### 3. Start PostgreSQL with pgvector

```bash
docker-compose up -d
```

This starts PostgreSQL 16 with the pgvector extension on **port 5433** (avoids conflict with any local PostgreSQL on 5432).

### 4. Run database migrations

```bash
docker exec -i bridge_postgres psql -U postgres -d bridge < database/migrations/001_init.sql
docker exec -i bridge_postgres psql -U postgres -d bridge < database/migrations/002_update_embedding_dimensions.sql
```

### 5. Start Ollama and pull the embedding model

```bash
# In a separate terminal — if Ollama is already running, skip the serve command
ollama serve
ollama pull nomic-embed-text
```

> **Note:** If Ollama is unavailable, the app runs in graceful degradation mode — embeddings are skipped and memory retrieval falls back to recency-based ordering.

### 6. Start the development server

```bash
npm run start:dev
```

Server starts at `http://localhost:3000`. Health check: `GET /api/health`

---

## Testing via Postman (Socket.IO)

### Connect
- URL: `ws://localhost:3000?userId=11111111-1111-1111-1111-111111111111`

### Add event listeners (Events tab)
- `chat:chunk`
- `chat:complete`
- `chat:error`

### Create a conversation first (REST)
```
POST http://localhost:3000/api/conversations
Body: { "userId": "11111111-1111-1111-1111-111111111111", "title": "Test" }
```

Copy the `id` from the response.

### Send a chat message (Message tab)
- Event name: `chat:send` (no leading spaces)
- Body:
```json
{
  "conversationId": "<conversation-id>",
  "content": "My friend Jake just started a company called ResumeAI.",
  "requestId": "req-1"
}
```

You'll see `chat:chunk` events streaming in, followed by `chat:complete`.

### Upload a document
```
POST http://localhost:3000/api/conversations/<id>/upload
Form-data: file = (select a .txt or .md file)
```

### Verify entity extraction
```bash
docker exec -it bridge_postgres psql -U postgres -d bridge \
  -c "SELECT name, relationship, facts FROM people WHERE user_id = '11111111-1111-1111-1111-111111111111';"
```

---

## Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage report (must exceed 90% lines/functions/statements, 80% branches)
npm run test:coverage
```

**Test breakdown:**
- 8 unit test files — 68 tests covering all service layers
- 2 integration test files — 13 tests covering full message and upload pipelines
- Pre-computed fixture vectors — no live API calls in tests

---

## Architecture

```
Client (WebSocket / REST)
        │
┌───────▼────────────────────────────────┐
│  NestJS Application (port 3000)         │
│                                         │
│  ChatGateway (WebSocket)                │
│  ├── ConversationsService               │
│  ├── StreamService (ChatGroq/LangChain) │
│  ├── ContextAssemblyService             │
│  │   └── SemanticSearchService          │
│  │       └── EmbeddingService (Ollama)  │
│  └── ExtractionGraph (LangGraph) ──┐   │
│                                    │   │
│  UploadController (REST)           │   │
│  ├── ChunkingService               │   │
│  ├── EmbeddingService              │   │
│  └── ExtractionGraph ─────────────┘   │
│                                         │
│  Background pipeline (fire-and-forget): │
│  message saved → embed → extract        │
└───────────────────┬─────────────────────┘
                    │
┌───────────────────▼─────────────────────┐
│  PostgreSQL 16 + pgvector (Docker:5433)  │
│  ├── conversations                       │
│  ├── conversation_messages               │
│  ├── message_embeddings  ◄── HNSW index │
│  ├── people                              │
│  └── memory_entries                      │
└──────────────────────────────────────────┘
```

## Key Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| LLM | Groq llama-3.3-70b-versatile | Free tier, fast inference |
| Embeddings | Ollama nomic-embed-text (768d) | Free, local, no API cost |
| Vector index | HNSW cosine | O(log n) ANN, better than IVFFlat for interactive |
| DB driver | node-postgres (pg) | Docker has no REST layer — direct connection only |
| Extraction timing | Fire-and-forget async | Never blocks chat response latency |
| Embedding failure | Graceful degradation | Recency fallback keeps app functional without Ollama |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `LLM_PROVIDER` | No | `groq` | `groq` or `anthropic` |
| `LLM_MODEL` | Yes | — | Model ID (e.g. `llama-3.3-70b-versatile`) |
| `GROQ_API_KEY` | If groq | — | From console.groq.com |
| `ANTHROPIC_API_KEY` | If anthropic | — | From console.anthropic.com |
| `EMBEDDING_PROVIDER` | No | `ollama` | `ollama`, `openai`, or `cohere` |
| `EMBEDDING_MODEL` | Yes | — | Model name (e.g. `nomic-embed-text`) |
| `EMBEDDING_DIMENSIONS` | No | `768` | Must match the model |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Ollama server URL |
| `MEMORY_TOP_K` | No | `5` | Results returned by semantic search |
| `CHUNK_SIZE` | No | `500` | Document chunk size in characters |
| `CHUNK_OVERLAP` | No | `50` | Overlap between chunks |
