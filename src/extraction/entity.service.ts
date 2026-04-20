import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { Database } from '../database/database.types';

type Person = Database['public']['Tables']['people']['Row'];

@Injectable()
export class EntityService {
  private readonly logger = new Logger(EntityService.name);

  constructor(private readonly db: DatabaseService) {}

  async upsertPerson(
    userId: string,
    name: string,
    relationship?: string,
    newFacts: string[] = [],
  ): Promise<Person> {
    const existing = await this.db.queryOne<Person>(
      `SELECT * FROM people WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
      [userId, name],
    );

    if (existing) {
      return this.mergeFacts(existing, relationship, newFacts);
    }

    const row = await this.db.queryOne<Person>(
      `INSERT INTO people (user_id, name, relationship, facts)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, name, relationship ?? null, JSON.stringify(newFacts)],
    );

    if (!row) throw new Error(`Failed to create person: ${name}`);

    this.logger.debug(`Created person: ${name} for user ${userId}`);
    return row;
  }

  private async mergeFacts(
    existing: Person,
    relationship?: string,
    newFacts: string[] = [],
  ): Promise<Person> {
    const currentFacts = Array.isArray(existing.facts) ? (existing.facts as string[]) : [];

    // Deduplicate facts — only add ones not already known (case-insensitive)
    const normalised = new Set(currentFacts.map((f) => f.toLowerCase()));
    const toAdd = newFacts.filter((f) => !normalised.has(f.toLowerCase()));
    const mergedFacts = [...currentFacts, ...toAdd];

    const updatedRelationship = relationship ?? existing.relationship;

    const row = await this.db.queryOne<Person>(
      `UPDATE people
       SET facts = $1,
           relationship = COALESCE($2, relationship),
           last_mentioned_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [JSON.stringify(mergedFacts), updatedRelationship, existing.id],
    );

    if (!row) throw new Error(`Failed to update person: ${existing.name}`);

    if (toAdd.length > 0) {
      this.logger.debug(`Merged ${toAdd.length} new facts into ${existing.name}`);
    }

    return row;
  }

  async findPerson(userId: string, name: string): Promise<Person | null> {
    return this.db.queryOne<Person>(
      `SELECT * FROM people WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
      [userId, name],
    );
  }

  async listPeople(userId: string): Promise<Person[]> {
    return this.db.query<Person>(
      `SELECT * FROM people WHERE user_id = $1 ORDER BY last_mentioned_at DESC`,
      [userId],
    );
  }
}
