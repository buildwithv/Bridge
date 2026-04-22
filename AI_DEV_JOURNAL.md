# AI Developer Journal — "Know Me" Conversational Memory Agent

**Developer:** vaishnavi1320  
**Tool:** Claude Code (claude-sonnet-4-6)  
**Duration:** ~2 days  

---

## How I Used Claude Code

This project was built entirely with Claude Code as the primary development tool. Every phase — from scaffolding to testing — was driven through Claude Code conversations, with me directing the architecture decisions and Claude generating and fixing the implementation.

### What I asked Claude to do
- Scaffold the NestJS project structure with TypeScript strict mode
- Write all database migrations (SQL) with pgvector and HNSW index
- Implement each service layer: WebSocket gateway, streaming, embedding, search, extraction, upload
- Debug errors live — sharing server logs and DB query results directly in the chat
- Write all unit and integration tests with mocked dependencies

### What I decided myself
- Use **Groq** (free LLM API) instead of OpenAI for cost reasons
- Use **Ollama** with `nomic-embed-text` (768 dims) for local embeddings
- Map Docker port to **5433** to avoid conflict with native PostgreSQL 18 on Windows
- Use `pg` (node-postgres) directly instead of Supabase SDK — Docker has no REST layer

---

## Key Technical Decisions

### LLM: Groq + llama-3.3-70b-versatile
Groq provides a free-tier API with fast inference. LangChain's `ChatGroq` wrapper makes it a drop-in replacement for any other provider. Model is configurable via `LLM_MODEL` env var.

### Embeddings: Ollama nomic-embed-text (768 dims)
Running Ollama locally means zero API cost for embeddings. The `EmbeddingService` has graceful degradation — if Ollama is down, it stores `null` vectors and falls back to recency-based search, so the app stays functional.

### LangGraph for Entity Extraction
The extraction pipeline uses a two-node LangGraph graph:
1. **Extract Node** — sends message to LLM, parses JSON response for people/facts/topics
2. **Store Node** — upserts people records, deduplicates facts, stores embeddings

The graph runs asynchronously (fire-and-forget) after each message is saved, so it never blocks the chat response.

### pgvector HNSW Index
Used HNSW (Hierarchical Navigable Small World) index with cosine similarity for vector search. HNSW gives O(log n) approximate nearest neighbour lookups, much faster than exact IVFFlat for interactive use cases.

### WebSocket Message Handling
Discovered during testing that Postman sends Socket.IO event names with a leading space when the event name field has leading whitespace. Fixed by using `socket.onAny()` for debugging and removing the `@UsePipes(ValidationPipe)` class decorator — instead parsing the raw body manually with JSON fallback.

---

## Challenges and How I Resolved Them

### Port Conflict (Windows)
Native PostgreSQL 18 was running on port 5432. Changed `docker-compose.yml` to map `5433:5432` and updated `DATABASE_URL` accordingly.

### LangChain Version Alignment
Multiple LangChain packages had peer dependency conflicts. Fixed by upgrading all `@langchain/*` packages to v1.x consistently — the packages must share the same major version.

### LangGraph API (v1.x)
LangGraph v1.x uses `Annotation.Root()` instead of the channel-based API from v0.x. Switched to the new API with typed state annotations.

### Vitest + SWC + NestJS
The SWC plugin was configured with `module: { type: 'commonjs' }` which caused Vitest to fail with "cannot require() an ESM module". Fixed by changing to `module: { type: 'es6' }`.

### Mocking LangGraph in Tests
`StateGraph`, `Annotation.Root`, and `Annotation<T>()` require careful mocking because `Annotation` is both callable and has static properties. Used `vi.hoisted()` + `Object.assign()` to create the dual-nature mock.

---

## Architecture Overview

```
Client (Postman / Frontend)
        │
        │  WebSocket (Socket.IO)
        ▼
┌─────────────────────┐
│   ChatGateway        │  chat:send → chat:chunk → chat:complete
│   (WebSocket)        │
└────────┬────────────┘
         │
    ┌────▼──────────────────────────┐
    │  ConversationsService          │  Save message to DB
    │  ContextAssemblyService        │  Assemble memory context
    │  StreamService (LangChain)     │  Stream LLM response
    └────┬──────────────────────────┘
         │  background (fire-and-forget)
    ┌────▼──────────────────────────┐
    │  EmbeddingService (Ollama)     │  Generate + store vector
    │  ExtractionGraph (LangGraph)   │  Extract entities → EntityService
    └───────────────────────────────┘

┌──────────────────────────────────────┐
│  UploadController (REST)             │  POST /conversations/:id/upload
│  ├── ChunkingService                 │  Split document into ~500-char chunks
│  ├── EmbeddingService                │  Embed each chunk
│  └── ExtractionGraph                 │  Extract people from each chunk
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  PostgreSQL + pgvector (Docker)      │
│  ├── conversations                   │
│  ├── conversation_messages           │
│  ├── message_embeddings (vector)     │  HNSW index, cosine similarity
│  ├── people                          │  Dedup + fact merging
│  └── memory_entries                  │
└──────────────────────────────────────┘
```

---

## What Claude Code Was Particularly Good At

1. **Debugging from logs** — pasting server error output and getting targeted fixes immediately
2. **Boilerplate elimination** — writing all the NestJS module wiring, DTO classes, SQL queries
3. **Test generation** — writing 81 tests with proper mocking patterns (vi.hoisted, vi.mock) for LangChain's complex module structure
4. **Windows-specific issues** — recognising the port conflict pattern and Docker pg_hba.conf workarounds

## What Required More Guidance

1. Postman's leading-space bug in event names — required raw socket debugging to discover
2. LangChain version alignment — needed manual dependency resolution
3. The fire-and-forget extraction pattern — needed to clarify async pipeline design
