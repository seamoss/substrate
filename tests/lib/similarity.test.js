import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { textSimilarity, findSimilar, checkDuplicate } from '../../src/lib/similarity.js';
import { createTestDb, createWorkspace, createContext } from '../helpers.js';

describe('Text Similarity', () => {
  describe('textSimilarity', () => {
    it('should return 1.0 for exact matches', () => {
      expect(textSimilarity('hello world', 'hello world')).toBe(1.0);
    });

    it('should return 1.0 for normalized matches', () => {
      expect(textSimilarity('Hello World', 'hello world')).toBe(1.0);
      expect(textSimilarity('  hello   world  ', 'hello world')).toBe(1.0);
    });

    it('should detect containment', () => {
      const similarity = textSimilarity(
        'API responses must be JSON',
        'API responses must be JSON format'
      );
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should detect word overlap', () => {
      const similarity = textSimilarity(
        'All API responses must return JSON',
        'API responses should be in JSON format'
      );
      expect(similarity).toBeGreaterThan(0.3);
    });

    it('should return low similarity for unrelated text', () => {
      const similarity = textSimilarity('API authentication required', 'Database uses PostgreSQL');
      expect(similarity).toBeLessThan(0.3);
    });
  });
});

describe('Duplicate Detection', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => {
    cleanup();
  });

  describe('findSimilar', () => {
    it('should find exact duplicates', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      createContext(db, {
        workspaceId: ws.id,
        type: 'constraint',
        content: 'All API responses must be JSON'
      });

      const similar = findSimilar(db, ws.id, 'All API responses must be JSON', 'constraint');

      expect(similar).toHaveLength(1);
      expect(similar[0].similarity).toBe(100);
    });

    it('should find similar content', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      createContext(db, {
        workspaceId: ws.id,
        type: 'constraint',
        content: 'API responses must be JSON format'
      });

      const similar = findSimilar(
        db,
        ws.id,
        'All API responses must return JSON',
        'constraint',
        0.5
      );

      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0].similarity).toBeGreaterThanOrEqual(50);
    });

    it('should not find unrelated content', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      createContext(db, {
        workspaceId: ws.id,
        type: 'constraint',
        content: 'Database must use PostgreSQL'
      });

      const similar = findSimilar(db, ws.id, 'API authentication is required', 'constraint', 0.6);

      expect(similar).toHaveLength(0);
    });

    it('should return results sorted by similarity', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      createContext(db, { workspaceId: ws.id, content: 'API uses REST' });
      createContext(db, { workspaceId: ws.id, content: 'API uses REST and returns JSON' });
      createContext(db, {
        workspaceId: ws.id,
        content: 'API uses REST and returns JSON responses'
      });

      const similar = findSimilar(
        db,
        ws.id,
        'API uses REST and returns JSON responses',
        'note',
        0.3
      );

      expect(similar.length).toBeGreaterThan(0);
      // First result should be the most similar
      for (let i = 1; i < similar.length; i++) {
        expect(similar[i - 1].similarity).toBeGreaterThanOrEqual(similar[i].similarity);
      }
    });
  });

  describe('checkDuplicate', () => {
    it('should return duplicate when very similar', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      createContext(db, {
        workspaceId: ws.id,
        type: 'constraint',
        content: 'All API responses must be JSON'
      });

      const duplicate = checkDuplicate(db, ws.id, 'All API responses must be JSON', 'constraint');

      expect(duplicate).not.toBeNull();
      expect(duplicate.similarity).toBeGreaterThanOrEqual(70);
    });

    it('should return null when no similar content', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      createContext(db, {
        workspaceId: ws.id,
        type: 'constraint',
        content: 'Database uses PostgreSQL'
      });

      const duplicate = checkDuplicate(db, ws.id, 'API authentication required', 'constraint');

      expect(duplicate).toBeNull();
    });

    it('should ignore deleted context', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const ctx = createContext(db, {
        workspaceId: ws.id,
        type: 'constraint',
        content: 'All API responses must be JSON'
      });

      // Soft delete
      db.prepare('UPDATE context SET deleted_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        ctx.id
      );

      const duplicate = checkDuplicate(db, ws.id, 'All API responses must be JSON', 'constraint');

      expect(duplicate).toBeNull();
    });
  });
});
