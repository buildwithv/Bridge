import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityService } from './entity.service';

const makePerson = (overrides = {}) => ({
  id: 'person-1',
  user_id: 'user-1',
  name: 'Jake',
  relationship: 'friend',
  facts: ['moved out', 'started a company'],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  last_mentioned_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

const makeDb = () => ({ queryOne: vi.fn(), query: vi.fn() });

describe('EntityService', () => {
  let service: EntityService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb();
    service = new EntityService(db as any);
  });

  describe('upsertPerson', () => {
    it('inserts new person when not found', async () => {
      db.queryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makePerson({ facts: ['started a company'] }));

      const result = await service.upsertPerson('user-1', 'Jake', 'friend', ['started a company']);

      expect(db.queryOne).toHaveBeenCalledTimes(2);
      expect(db.queryOne).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO people'),
        expect.arrayContaining(['user-1', 'Jake', 'friend']),
      );
      expect(result.name).toBe('Jake');
    });

    it('merges new facts into existing person', async () => {
      const existing = makePerson({ facts: ['moved out'] });
      db.queryOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(makePerson({ facts: ['moved out', 'started a company'] }));

      const result = await service.upsertPerson('user-1', 'Jake', undefined, ['started a company']);

      expect(db.queryOne).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE people'),
        expect.arrayContaining([JSON.stringify(['moved out', 'started a company'])]),
      );
      expect(result.facts).toContain('started a company');
    });

    it('deduplicates facts case-insensitively on merge', async () => {
      const existing = makePerson({ facts: ['Moved Out'] });
      db.queryOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(makePerson({ facts: ['Moved Out'] }));

      await service.upsertPerson('user-1', 'Jake', undefined, ['moved out']);

      const updateCall = db.queryOne.mock.calls[1] as unknown[][];
      const params = updateCall[1] as unknown[];
      const mergedFacts = JSON.parse(params[0] as string) as string[];
      expect(mergedFacts).toHaveLength(1);
    });

    it('throws when insert returns no row', async () => {
      db.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await expect(service.upsertPerson('user-1', 'Jake')).rejects.toThrow('Failed to create person');
    });

    it('throws when update returns no row', async () => {
      db.queryOne.mockResolvedValueOnce(makePerson()).mockResolvedValueOnce(null);

      await expect(service.upsertPerson('user-1', 'Jake', undefined, ['new fact'])).rejects.toThrow(
        'Failed to update person',
      );
    });
  });

  describe('findPerson', () => {
    it('returns person when found', async () => {
      const person = makePerson();
      db.queryOne.mockResolvedValue(person);

      const result = await service.findPerson('user-1', 'Jake');

      expect(result).toEqual(person);
      expect(db.queryOne).toHaveBeenCalledWith(expect.any(String), ['user-1', 'Jake']);
    });

    it('returns null when not found', async () => {
      db.queryOne.mockResolvedValue(null);

      const result = await service.findPerson('user-1', 'Nobody');

      expect(result).toBeNull();
    });
  });

  describe('listPeople', () => {
    it('returns all people for a user ordered by last_mentioned_at', async () => {
      const people = [makePerson(), makePerson({ id: 'person-2', name: 'Marcus' })];
      db.query.mockResolvedValue(people);

      const result = await service.listPeople('user-1');

      expect(result).toHaveLength(2);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY last_mentioned_at DESC'),
        ['user-1'],
      );
    });

    it('returns empty array when no people found', async () => {
      db.query.mockResolvedValue([]);

      const result = await service.listPeople('user-1');

      expect(result).toEqual([]);
    });
  });
});
