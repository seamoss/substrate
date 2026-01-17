import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('API Client', () => {
  let tempDir;
  let originalHomedir;
  let originalEnv;

  beforeEach(() => {
    // Create temp directory for config files
    tempDir = mkdtempSync(join(tmpdir(), 'substrate-api-test-'));
    const substrateDir = join(tempDir, '.substrate');
    mkdirSync(substrateDir);

    // Store original values
    originalHomedir = process.env.HOME;
    originalEnv = process.env.SUBSTRATE_API_URL;

    // Mock homedir to use temp directory
    process.env.HOME = tempDir;
    process.env.SUBSTRATE_API_URL = 'http://localhost:3000';

    // Reset module cache so api.js picks up new env
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original values
    process.env.HOME = originalHomedir;
    if (originalEnv) {
      process.env.SUBSTRATE_API_URL = originalEnv;
    } else {
      delete process.env.SUBSTRATE_API_URL;
    }
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('request handling', () => {
    it('should make requests with correct headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' })
      });
      vi.stubGlobal('fetch', mockFetch);

      const { api } = await import('../../src/lib/api.js');
      await api.health();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/health',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should include auth header when token exists', async () => {
      // Write auth file
      writeFileSync(
        join(tempDir, '.substrate', 'auth.json'),
        JSON.stringify({ api_key: 'test-token-123' })
      );

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ workspaces: [] })
      });
      vi.stubGlobal('fetch', mockFetch);

      const { api } = await import('../../src/lib/api.js');
      await api.listWorkspaces();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123'
          })
        })
      );
    });

    it('should handle offline gracefully', async () => {
      const connectionError = new Error('Connection refused');
      connectionError.cause = { code: 'ECONNREFUSED' };

      const mockFetch = vi.fn().mockRejectedValue(connectionError);
      vi.stubGlobal('fetch', mockFetch);

      const { api } = await import('../../src/lib/api.js');
      const result = await api.health();

      expect(result).toEqual({ offline: true, error: 'API unavailable' });
    });

    it('should throw on HTTP errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' })
      });
      vi.stubGlobal('fetch', mockFetch);

      const { api } = await import('../../src/lib/api.js');

      await expect(api.me()).rejects.toThrow('Unauthorized');
    });
  });

  describe('workspace endpoints', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({})
        })
      );
    });

    it('should call correct endpoint for listWorkspaces', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.listWorkspaces();

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workspaces',
        expect.any(Object)
      );
    });

    it('should call correct endpoint for getWorkspace', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.getWorkspace('ws-123');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workspaces/ws-123',
        expect.any(Object)
      );
    });

    it('should call correct endpoint for createWorkspace with body', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.createWorkspace('my-project', 'A test project', 'proj-456');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workspaces',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'my-project',
            description: 'A test project',
            project_id: 'proj-456'
          })
        })
      );
    });

    it('should call correct endpoint for getWorkspaceByProjectId', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.getWorkspaceByProjectId('proj-789');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workspaces/by-project/proj-789',
        expect.any(Object)
      );
    });
  });

  describe('context endpoints', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({})
        })
      );
    });

    it('should call correct endpoint for listContext with filters', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.listContext('ws-123', { type: 'constraint', limit: '10' });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/context/ws-123?type=constraint&limit=10',
        expect.any(Object)
      );
    });

    it('should call correct endpoint for addContext', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.addContext('ws-123', 'constraint', 'All responses must be JSON', ['api'], '*');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/context/ws-123',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            type: 'constraint',
            content: 'All responses must be JSON',
            tags: ['api'],
            scope: '*'
          })
        })
      );
    });

    it('should call correct endpoint for getBrief', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.getBrief('ws-123', '/src', 'frontend');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/context/ws-123/brief'),
        expect.any(Object)
      );
    });

    it('should call correct endpoint for linkContext', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.linkContext('ws-123', 'ctx-1', 'ctx-2', 'depends_on');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/context/ws-123/link',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            from: 'ctx-1',
            to: 'ctx-2',
            relation: 'depends_on'
          })
        })
      );
    });

    it('should call correct endpoint for getRelated with depth', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.getRelated('ws-123', 'ctx-456', 2);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/context/ws-123/related/ctx-456?depth=2',
        expect.any(Object)
      );
    });
  });

  describe('sync endpoints', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({})
        })
      );
    });

    it('should call correct endpoint for syncPush', async () => {
      const { api } = await import('../../src/lib/api.js');
      const items = [{ id: 'ctx-1', content: 'test' }];
      await api.syncPush('ws-123', items);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/sync/ws-123/batch',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ items })
        })
      );
    });

    it('should call correct endpoint for syncPull with since', async () => {
      const { api } = await import('../../src/lib/api.js');
      const since = '2024-01-01T00:00:00Z';
      await api.syncPull('ws-123', since);

      expect(fetch).toHaveBeenCalledWith(
        `http://localhost:3000/api/sync/ws-123/changes?since=${encodeURIComponent(since)}`,
        expect.any(Object)
      );
    });

    it('should call syncPull without since parameter', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.syncPull('ws-123');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/sync/ws-123/changes',
        expect.any(Object)
      );
    });
  });

  describe('auth endpoints', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({})
        })
      );
    });

    it('should call correct endpoint for init', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.init();

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/init',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({})
        })
      );
    });

    it('should call correct endpoint for signup', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.signup('test@example.com');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/signup',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com' })
        })
      );
    });

    it('should call correct endpoint for verify', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.verify('test@example.com', '123456');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com', code: '123456' })
        })
      );
    });

    it('should call correct endpoint for createWorkspaceToken', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.createWorkspaceToken('ws-123', 'ci-token', 'read', '30');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/tokens',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            workspace_id: 'ws-123',
            name: 'ci-token',
            scope: 'read',
            expires_in_days: 30
          })
        })
      );
    });

    it('should call correct endpoint for revokeKey', async () => {
      const { api } = await import('../../src/lib/api.js');
      await api.revokeKey('key-123');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/keys/key-123',
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
  });
});
