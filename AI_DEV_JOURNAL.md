# AI Developer Journal — "Know Me" Conversational Memory Agent

**Developer:** vaishnavi1320
**Duration:** ~2 days

---

## What I Built and Why

I built a conversational memory agent that genuinely remembers things about you — people in your life, facts, emotional context — and uses that memory to give more personal, relevant responses over time. The core challenge was making memory feel natural: fast retrieval, semantic understanding, and background processing that never interrupts the conversation.

I used AI coding tools to accelerate implementation speed on well-defined tasks like boilerplate and SQL. Every architectural decision, technology choice, and debugging approach was mine.

---

## Architecture Decisions I Made

### Why Groq instead of OpenAI
I chose Groq's free-tier API (`llama-3.3-70b-versatile`) for cost reasons — this is a demo project and OpenAI costs add up fast during development. LangChain's `ChatGroq` wrapper is a drop-in replacement so the provider is fully swappable via `LLM_MODEL` env var.

### Why Ollama for embeddings
Running `nomic-embed-text` locally via Ollama means zero API cost and zero latency for embedding calls. I specifically chose 768 dimensions because it's a good balance of semantic quality and storage size for pgvector. I also built graceful degradation into the `EmbeddingService` — if Ollama is down, it stores `null` vectors and falls back to recency-based context, so the app never crashes.

### Why pg (node-postgres) directly, not an ORM
pgvector's `<=>` cosine similarity operator and HNSW index don't work well through ORMs — you lose control of the query shape. I wrote raw SQL to keep full control over the vector search queries and the upsert logic for the people table.

### Fire-and-forget extraction pipeline
After saving each message, I run embedding and entity extraction in the background — not awaited. The user gets their streaming response immediately. Extraction is best-effort; if it fails, the conversation still works. This was a deliberate UX decision: never make the user wait for background processing.

### Docker port mapping to 5433
I have native PostgreSQL running on port 5432 on Windows. I mapped Docker to `5433:5432` and updated the `DATABASE_URL` accordingly rather than stopping my local Postgres instance.

---

## Key Technical Decisions

### LangGraph two-node extraction pipeline
I structured extraction as a two-node LangGraph graph:
1. **Extract Node** — prompts the LLM with the message, parses the structured JSON response (people, relationships, facts, topics, emotional tone)
2. **Store Node** — upserts people records with fact deduplication so the same fact is never stored twice

Running this as a graph gives me clean state management and makes it easy to add more nodes later (e.g. a summarisation node).

### pgvector HNSW index
I chose HNSW (Hierarchical Navigable Small World) over IVFFlat because HNSW gives O(log n) approximate nearest neighbour lookups without needing a training step. For an interactive chat app where every millisecond of recall latency matters, this was the right call.

### WebSocket body parsing
NestJS's `@UsePipes(ValidationPipe)` on a WebSocket gateway rejects messages before the handler runs if the body doesn't match the DTO exactly. Since Postman sends Socket.IO payloads as JSON strings, not objects, I removed the class-level pipe and handled parsing manually — JSON.parse if string, direct cast if already an object.

---

## Debugging Challenges

### Invisible leading space in Postman event name
Messages were being sent but the gateway handler never fired. I added a `socket.onAny((event) => console.log('RAW event=', JSON.stringify(event)))` listener and saw `" chat:send"` with a leading space — Postman had whitespace in the event name field. Removed the space and everything worked.

### LangChain package version conflicts
Multiple `@langchain/*` packages were on different major versions with conflicting peer dependencies. Fixed by aligning all packages to v1.x. The packages share internal interfaces across the monorepo and must be on the same major version.

### LangGraph v1.x API change
LangGraph v1.x replaced the channel-based state definition with `Annotation.Root()`. I rewrote the graph state definition using typed annotations and updated all node signatures to match.

### Vitest + SWC module format mismatch
The SWC transformer plugin was configured with `module: { type: 'commonjs' }`. Vitest runs in ESM mode and throws "cannot require() an ESM module" when SWC outputs CommonJS. Fixed by changing to `module: { type: 'es6' }`.

### Mocking LangGraph's Annotation in Vitest
`Annotation` is both a callable function (`Annotation<T>()`) and has a static property (`Annotation.Root()`). Standard `vi.fn()` only gives you the callable side. I used `vi.hoisted()` to declare the mock functions before imports, then `Object.assign()` to attach the `.Root` static method — making the mock match the real module's shape.

---

## Architecture Overview

```
Client (Browser / Postman)
        │
        │  WebSocket (Socket.IO)
        ▼
┌─────────────────────┐
│   ChatGateway        │  chat:send → chat:chunk → chat:complete
└────────┬────────────┘
         │
    ┌────▼──────────────────────────┐
    │  ConversationsService          │  Save message to DB
    │  ContextAssemblyService        │  Semantic memory recall
    │  StreamService                 │  Stream LLM response chunks
    └────┬──────────────────────────┘
         │  background (fire-and-forget)
    ┌────▼──────────────────────────┐
    │  EmbeddingService (Ollama)     │  Generate + store vector
    │  ExtractionGraph (LangGraph)   │  Extract entities → people table
    └───────────────────────────────┘

┌──────────────────────────────────────┐
│  UploadController (REST)             │  POST /conversations/:id/upload
│  ├── ChunkingService                 │  Split into ~500-char chunks
│  ├── EmbeddingService                │  Embed each chunk
│  └── ExtractionGraph                 │  Extract people from each chunk
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  PostgreSQL + pgvector (Docker:5433) │
│  ├── conversations                   │
│  ├── conversation_messages           │
│  ├── message_embeddings (vector)     │  HNSW cosine index
│  ├── people                          │  Dedup + fact merging
│  └── memory_entries                  │
└──────────────────────────────────────┘
```

---

## Test Strategy

I wrote 81 tests across unit and integration levels with no live API calls.

**Unit tests** mock LangChain providers (OllamaEmbeddings, ChatGroq, ChatPromptTemplate) and the database client. Each service is tested in isolation.

**Integration tests** wire real service instances together using pre-computed 768-dimensional fixture vectors — the same shape as real Ollama output — so the full pipeline runs deterministically.

**Coverage** is above 90% for the service layer. Infrastructure files (gateways, controllers, database client) are excluded from thresholds since they're covered by integration and manual testing.

Key test cases I specifically designed:
- Graceful degradation: embedding failure should not crash document upload
- Fact deduplication: storing the same fact twice should result in one record
- Semantic search fallback: if no vector results, return recent messages
- Context assembly: person facts appear in the assembled prompt
