import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGroq } from '@langchain/groq';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Annotation, StateGraph, END, START } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { EntityService } from './entity.service';
import { EmbeddingService } from '../memory/embedding.service';
import { DatabaseService } from '../database/database.service';
import type { ExtractionResult } from './extraction.types';

const EXTRACT_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an information extraction system. Extract structured data from the user's message.

Return ONLY valid JSON with this exact structure:
{{
  "people": [
    {{
      "name": "string",
      "relationship": "string or null",
      "facts": ["array of specific facts about this person"]
    }}
  ],
  "topics": ["list of topics discussed"],
  "emotionalTone": "one of: positive, negative, neutral, mixed",
  "keyFacts": ["important facts about the user themselves"]
}}

Rules:
- Only include people explicitly named
- Facts should be specific and memorable
- If nothing relevant, return empty arrays
- Return raw JSON only, no markdown`,
  ],
  ['human', '{message}'],
]);

const ExtractionStateAnnotation = Annotation.Root({
  userId: Annotation<string>(),
  messageId: Annotation<string>(),
  content: Annotation<string>(),
  extracted: Annotation<ExtractionResult | undefined>(),
  stored: Annotation<boolean | undefined>(),
  error: Annotation<string | undefined>(),
});

type ExtractionState = typeof ExtractionStateAnnotation.State;

@Injectable()
export class ExtractionGraph {
  private readonly logger = new Logger(ExtractionGraph.name);
  private readonly model: BaseChatModel;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly compiledGraph: { invoke: (input: Partial<ExtractionState>) => Promise<ExtractionState> };

  constructor(
    private readonly config: ConfigService,
    private readonly entityService: EntityService,
    private readonly embeddingService: EmbeddingService,
    private readonly db: DatabaseService,
  ) {
    const provider = this.config.get<string>('LLM_PROVIDER', 'groq');
    const modelId = this.config.getOrThrow<string>('LLM_MODEL');

    this.model =
      provider === 'anthropic'
        ? new ChatAnthropic({
            model: modelId,
            apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
          })
        : new ChatGroq({
            model: modelId,
            apiKey: this.config.getOrThrow<string>('GROQ_API_KEY'),
          });

    this.compiledGraph = this.buildGraph();
    this.logger.log('Extraction graph initialized');
  }

  private buildGraph() {
    const graph = new StateGraph(ExtractionStateAnnotation)
      .addNode('extract', this.extractNode.bind(this))
      .addNode('store', this.storeNode.bind(this))
      .addEdge(START, 'extract')
      .addConditionalEdges('extract', (state: ExtractionState) =>
        state.error ? END : 'store',
      )
      .addEdge('store', END);

    return graph.compile();
  }

  private async extractNode(state: ExtractionState): Promise<Partial<ExtractionState>> {
    try {
      const chain = EXTRACT_PROMPT.pipe(this.model);
      const response = await chain.invoke({ message: state.content });
      const text = typeof response.content === 'string' ? response.content : '';

      const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const extracted = JSON.parse(cleaned) as ExtractionResult;

      this.logger.debug(
        `Extracted ${extracted.people.length} people from message ${state.messageId}`,
      );

      return { extracted };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Extraction failed for message ${state.messageId}: ${msg}`);
      return { error: msg };
    }
  }

  private async storeNode(state: ExtractionState): Promise<Partial<ExtractionState>> {
    if (!state.extracted) return { stored: false };

    const { userId, extracted } = state;

    try {
      for (const person of extracted.people) {
        const entity = await this.entityService.upsertPerson(
          userId,
          person.name,
          person.relationship ?? undefined,
          person.facts,
        );

        if (person.facts.length > 0) {
          const content = `${person.name}${person.relationship ? ` (${person.relationship})` : ''}: ${person.facts.join('; ')}`;
          const embeddingId = await this.embeddingService.storeEmbedding(
            userId,
            content,
            'memory',
            { messageId: state.messageId, personId: entity.id },
          );

          await this.db.query(
            `INSERT INTO memory_entries (user_id, content, category, entity_id, embedding_id)
             VALUES ($1, $2, 'relationship', $3, $4)`,
            [userId, content, entity.id, embeddingId],
          );
        }
      }

      for (const fact of extracted.keyFacts) {
        const embeddingId = await this.embeddingService.storeEmbedding(
          userId,
          fact,
          'memory',
          { messageId: state.messageId },
        );

        await this.db.query(
          `INSERT INTO memory_entries (user_id, content, category, embedding_id)
           VALUES ($1, $2, 'fact', $3)`,
          [userId, fact, embeddingId],
        );
      }

      this.logger.debug(`Stored entities for message ${state.messageId}`);
      return { stored: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Store node failed: ${msg}`);
      return { stored: false, error: msg };
    }
  }

  async run(userId: string, messageId: string, content: string): Promise<void> {
    await this.compiledGraph.invoke({ userId, messageId, content });
  }
}
