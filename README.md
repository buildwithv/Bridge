# Bridge Project 

**Tool Required:** Claude Code (primary development tool)


---

## Context

Bridge is building an AI companion that deeply understands people through conversation and document analysis. The core product revolves around an AI agent ("Shirin") that builds a living psychological profile of each user through organic dialogue, structured assessments, and artifact analysis — remembering everything across sessions and using that knowledge to become increasingly helpful over time.

Your task is to build a **focused vertical slice** of this system: a backend-driven AI chat agent that progressively learns about a user through conversation and document uploads, storing everything as vector embeddings for semantic recall.

---

## What You're Building

**"Know Me" — A Conversational Memory Agent**

A NestJS backend application where an AI agent engages users in conversation, extracts and remembers key facts about them and people in their life, allows document uploads (e.g., journal entries, chat exports, notes about people) that get parsed and embedded, and uses semantic memory retrieval to demonstrate recall in future messages.

---

## Tech Stack (Mandatory)

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 22, TypeScript (strict mode) |
| Framework | NestJS 11 |
| Database | Supabase PostgreSQL + pgvector (local via Docker) |
| AI / LLM | Your choice — any LLM provider (Anthropic, OpenAI, local Ollama, etc.) via LangChain provider wrappers |
| Embeddings | Your choice — any embedding model (OpenAI, Cohere, local Ollama, etc.) via LangChain. Document the model and dimensions used. |
| Orchestration | LangGraph (for the extraction pipeline) |
| Real-time | WebSocket via Socket.io (`@nestjs/websockets` + `@nestjs/platform-socket.io`) |
| Validation | `class-validator` + `class-transformer` (no Zod) |
| Testing | Vitest |
| Package Manager | pnpm |

> **Important:** All AI prompts must use LangChain prompt templates (e.g., `ChatPromptTemplate`) — no raw string interpolation for prompts. Model IDs should be configurable (environment variable or config file), not hardcoded. All LLM and embedding integrations must go through LangChain provider wrappers for abstraction.

---

## Functional Requirements

### FR1 — Conversational Chat via WebSocket

- Client connects to a WebSocket gateway with a `userId` (simple auth — no full JWT flow needed, just pass userId in handshake query).
- Client sends messages via `chat:send` event: `{ conversationId, content, requestId }`.
- Server streams AI responses back via `chat:chunk` events, followed by a `chat:complete` event.
- The AI agent's system prompt includes relevant memory context retrieved before each response.
- Messages (both user and assistant) are persisted to a `conversation_messages` table.

### FR2 — Entity Extraction Pipeline (LangGraph)

After each user message is stored, a **background pipeline** runs (can be in-process via an async call or a simple event emitter — no Inngest required for this task):

1. **Embedding Generation** — Generate a vector embedding of the message using your chosen embedding model and store it in a `message_embeddings` table with pgvector.
2. **Entity Extraction** — Use a LangGraph graph with at least 2 nodes:
   - **Extract Node:** Calls an LLM (your choice — can be a smaller/cheaper model) to extract structured data from the message: person names mentioned, relationships to the user, key facts, emotional tone, topics discussed.
   - **Store Node:** Persists extracted entities to a `people` table (name, relationship, known facts as JSONB) and `memory_entries` table (content, category, entity references). Generates and stores embeddings for each memory entry.
3. If a person already exists in the `people` table (by name + user), merge new facts into existing record rather than creating duplicates.

### FR3 — Document Upload & Processing

- REST endpoint: `POST /api/conversations/:conversationId/upload` — accepts a text file (.txt or .md, max 50KB for this task).
- The uploaded document is chunked (simple strategy: split by paragraphs or every ~500 characters with overlap).
- Each chunk gets an embedding generated and stored in `message_embeddings` (with a `source` field distinguishing `message` vs `document`).
- The same LangGraph entity extraction pipeline (FR2) runs on each chunk to extract people and facts.
- After processing completes, the AI agent sends a `chat:complete` event with a summary message: "I've read your document. I noticed mentions of [extracted people]. What would you like to discuss about it?"

### FR4 — Semantic Memory Retrieval

- Before generating each AI response, the system performs a vector similarity search against `message_embeddings` to find the top-k (k=5) most relevant past messages/document chunks.
- If the user mentions a person by name, additionally query the `people` table and include that person's known facts in the AI context.
- The retrieved context is injected into the system prompt so the AI agent can reference past conversations and uploaded documents naturally.
- The retrieval must work across both conversation messages and document uploads (unified vector search).

### FR5 — Memory Demonstration

The AI agent should be able to:

- Reference facts from earlier in the conversation ("You mentioned earlier that your sister lives in Toronto...").
- Reference facts from uploaded documents ("Based on the journal entry you shared, it seems like your relationship with Alex has been on your mind...").
- When asked about a specific person, retrieve and synthesize everything known about them from all sources.
- Acknowledge when it doesn't have information rather than fabricating ("I don't think you've told me about that yet").

---

## Database Schema Requirements

You need at minimum these tables (you may add more if needed):

| Table | Key Columns |
|-------|-------------|
| `conversations` | id (uuid), user_id (uuid), status, title, created_at, updated_at |
| `conversation_messages` | id (uuid), conversation_id (uuid FK), user_id, role (user/assistant), content, metadata (jsonb), created_at |
| `message_embeddings` | id (uuid), message_id (uuid FK, nullable), user_id, content (text), embedding (vector — dimensions match your chosen model), source (message/document/memory), metadata (jsonb), created_at |
| `people` | id (uuid), user_id, name, relationship, facts (jsonb), first_mentioned_at, last_mentioned_at, created_at, updated_at |
| `memory_entries` | id (uuid), user_id, content, category (fact/preference/relationship/emotion), entity_id (uuid FK to people, nullable), embedding_id (uuid FK, nullable), created_at |

- All tables must have Row-Level Security (RLS) policies scoped to `user_id`.
- Use HNSW indexing on the embedding column: `CREATE INDEX ON message_embeddings USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);` (adjust vector dimensions to match your chosen embedding model).

---

## Non-Functional Requirements

- **NFR1 — Performance:** Vector similarity search completes within 200ms.
- **NFR2 — Streaming:** AI responses stream token-by-token to the client via WebSocket chunks.
- **NFR3 — Graceful Degradation:** If the embedding service is unavailable, conversations should continue without semantic search (recency-based context fallback).
- **NFR4 — No `console.log`:** Use NestJS `Logger` for all logging.
- **NFR5 — No `any` types:** Strict TypeScript — prefer `unknown` with narrowing.
- **NFR6 — Config:** All API keys and model IDs via environment variables (never hardcoded). Provide a `.env.example` file.

---

## Testing Requirements

This is a critical evaluation area. We want to see thoughtful, well-structured tests.

### Unit Tests (Required — aim for ≥90% coverage on services)

- **`embedding.service.spec.ts`** — Mock embedding API calls; verify embedding generation, storage, and graceful degradation when the service is down.
- **`semantic-search.service.spec.ts`** — Mock Supabase vector queries; verify top-k retrieval, source filtering, entity-specific filtering.
- **`entity.service.spec.ts`** — Verify entity creation, deduplication (same name + user), fact merging into existing records.
- **`context-assembly.service.spec.ts`** — Verify context is assembled correctly from memory + entity data, and that the prompt template is populated properly.
- **`extraction.graph.spec.ts`** — Mock LLM calls; verify the LangGraph pipeline extracts entities correctly and routes to store node.
- **`stream.service.spec.ts`** — Verify streaming pipeline: context retrieval → prompt assembly → LLM streaming → chunk emission.

### Integration Tests (At least 2)

- **End-to-end message flow:** Send a message → verify it's stored → verify embedding is generated → verify entities are extracted → send a follow-up message referencing extracted entity → verify the AI context includes the entity's facts.
- **Document upload flow:** Upload a document → verify chunks are created and embedded → verify entities are extracted → send a message asking about content from the document → verify semantic search returns relevant chunks.

### Test Principles

- **Pre-computed embedding fixtures:** Tests must NEVER call real embedding APIs. Use deterministic fixture vectors.
- **Mock LLM responses:** All tests mock LLM responses with realistic fixture data.
- **Database tests:** Use a test database (Supabase local) or mock the Supabase client — your choice, but document which approach and why.

---

## Test Data — Sample Journal

We've provided a file called `sample_journal.txt` — a 6-month personal journal (~2,500 words) covering a person's day-to-day life. **Use this file for your live demo and integration tests.** It's designed to exercise your entity extraction and memory recall thoroughly.

The journal contains:

- **8+ named people** with distinct relationships (girlfriend, roommate, brother, sister, parents, coworker/tech lead, new roommate, junior mentee)
- **Relationship arcs that evolve over time** — a difficult coworker who becomes a mentor, a roommate who moves out, a sister who moves back
- **Emotional tone shifts** — frustration, pride, sadness, gratitude, conflict, celebration
- **Overlapping entity references** — the same people appear across multiple entries with new facts each time
- **Specific testable facts** — names, cities, job titles, relationship milestones, dates, events

A strong implementation should be able to answer questions like:
- "What do you know about Marcus?" → synthesize the full arc from antagonist to mentor
- "Tell me about my sister" → Lily, designer, lived in Vancouver, moving back to Toronto
- "Who is Jake?" → roommate of 3 years, startup founder (ResumeAI), moved out in March
- "What's going on with my dad's health?" → blood pressure issues, cardiologist visit, improving with medication
- "How is my relationship with Sophie?" → together since February 2025, she defended her thesis, met the parents, had their first fight

Include this file in your repository and use it in your Loom demo to show document upload → entity extraction → conversational recall.

---
