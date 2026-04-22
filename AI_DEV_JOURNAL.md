# AI Developer Journal — "Know Me" Conversational Memory Agent

**Developer:** vaishnavi1320  
**Tool:** Claude Code (claude-sonnet-4-6)  
**Duration:** ~2 days  

---

## How I Used AI Assistance

I used Claude Code as an AI pair-programming assistant throughout this project — primarily for generating boilerplate, writing SQL migrations, and producing test scaffolding. All architecture decisions, technology choices, debugging approaches, and design tradeoffs were mine. Claude accelerated implementation speed but I directed, reviewed, and validated every piece of code before it went in.

### Where AI assistance helped most
- Generating NestJS boilerplate (module wiring, DTO classes, decorators)
- Writing SQL migrations for pgvector schema
- Producing test scaffolding for complex LangChain mock patterns
- Drafting initial implementations that I then refined

### Architecture and design decisions I made
- Use **Groq** (free LLM API) instead of OpenAI — cost and speed tradeoff
- Use **Ollama** with `nomic-embed-text` (768 dims) for fully local embeddings
- Map Docker port to **5433** to avoid conflict with native PostgreSQL on Windows
- Use `pg` (node-postgres) directly instead of an ORM — full control over vector queries
- Fire-and-forget extraction pipeline — never block the chat response
- Graceful degradation when Ollama is offline — store null vectors, fall back to recency search

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

## What I Found Most Technically Interesting

1. **Debugging the Postman leading-space bug** — added a `socket.onAny()` raw listener to log every event name and discovered the event was arriving as `" chat:send"` with a leading space. Classic invisible character issue.
2. **LangChain version alignment** — multiple `@langchain/*` packages had peer dependency conflicts across major versions. Resolved by pinning all packages to v1.x together.
3. **LangGraph v1.x migration** — the `Annotation.Root()` API replaced the older channel-based approach. Needed to restructure the state graph definition.
4. **Vitest + SWC ESM compatibility** — SWC plugin was configured for CommonJS output which conflicts with Vitest's ESM runner. Fixed by switching `module.type` to `es6`.
5. **Mocking dual-nature objects in Vitest** — `Annotation` in LangGraph is both a callable function and has static properties. Used `vi.hoisted()` with `Object.assign()` to replicate that shape in tests.
