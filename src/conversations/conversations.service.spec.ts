import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

const makeConversation = (overrides = {}) => ({
  id: 'conv-1',
  user_id: 'user-1',
  title: 'Test Chat',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

const makeMessage = (overrides = {}) => ({
  id: 'msg-1',
  conversation_id: 'conv-1',
  user_id: 'user-1',
  role: 'user',
  content: 'Hello',
  metadata: {},
  created_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

const makeDb = () => ({ queryOne: vi.fn(), query: vi.fn() });

describe('ConversationsService', () => {
  let service: ConversationsService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb();
    service = new ConversationsService(db as any);
  });

  describe('create', () => {
    it('inserts a conversation and returns it', async () => {
      const conv = makeConversation();
      db.queryOne.mockResolvedValue(conv);

      const result = await service.create('user-1', 'Test Chat');

      expect(result).toEqual(conv);
      expect(db.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO conversations'),
        ['user-1', 'Test Chat'],
      );
    });

    it('uses null when title is not provided', async () => {
      db.queryOne.mockResolvedValue(makeConversation({ title: null }));

      await service.create('user-1');

      expect(db.queryOne).toHaveBeenCalledWith(expect.any(String), ['user-1', null]);
    });

    it('throws when insert returns no row', async () => {
      db.queryOne.mockResolvedValue(null);

      await expect(service.create('user-1')).rejects.toThrow('Failed to create conversation');
    });
  });

  describe('findOne', () => {
    it('returns the conversation when found', async () => {
      const conv = makeConversation();
      db.queryOne.mockResolvedValue(conv);

      const result = await service.findOne('conv-1', 'user-1');

      expect(result).toEqual(conv);
      expect(db.queryOne).toHaveBeenCalledWith(expect.any(String), ['conv-1', 'user-1']);
    });

    it('throws NotFoundException when not found', async () => {
      db.queryOne.mockResolvedValue(null);

      await expect(service.findOne('conv-x', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('returns conversations ordered by created_at desc', async () => {
      const convs = [makeConversation(), makeConversation({ id: 'conv-2' })];
      db.query.mockResolvedValue(convs);

      const result = await service.findAll('user-1');

      expect(result).toHaveLength(2);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        ['user-1'],
      );
    });
  });

  describe('saveMessage', () => {
    it('inserts and returns the message', async () => {
      const msg = makeMessage();
      db.queryOne.mockResolvedValue(msg);

      const result = await service.saveMessage('conv-1', 'user-1', 'user', 'Hello');

      expect(result).toEqual(msg);
      expect(db.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO conversation_messages'),
        expect.arrayContaining(['conv-1', 'user-1', 'user', 'Hello']),
      );
    });

    it('throws when insert returns no row', async () => {
      db.queryOne.mockResolvedValue(null);

      await expect(service.saveMessage('conv-1', 'user-1', 'user', 'Hello')).rejects.toThrow(
        'Failed to save message',
      );
    });
  });

  describe('getRecentMessages', () => {
    it('returns messages in ascending order', async () => {
      const messages = [makeMessage(), makeMessage({ id: 'msg-2', role: 'assistant' })];
      db.query.mockResolvedValue(messages);

      const result = await service.getRecentMessages('conv-1', 10);

      expect(result).toHaveLength(2);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at ASC'), [
        'conv-1',
        10,
      ]);
    });
  });
});
