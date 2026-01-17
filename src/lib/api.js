import { getApiUrl } from './config.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const BASE_URL = getApiUrl();
const AUTH_FILE = join(homedir(), '.substrate', 'auth.json');

/**
 * Load auth token from config file
 */
function getAuthToken() {
  try {
    if (existsSync(AUTH_FILE)) {
      const data = JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
      return data.api_key || null;
    }
  } catch (err) {
    // Ignore
  }
  return null;
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const token = getAuthToken();

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Add auth header if we have a token
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      ...options,
      headers
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    return data;
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      return { offline: true, error: 'API unavailable' };
    }
    throw err;
  }
}

export const api = {
  // Workspaces
  async listWorkspaces() {
    return request('/api/workspaces');
  },

  async getWorkspace(id) {
    return request(`/api/workspaces/${id}`);
  },

  async createWorkspace(name, description, projectId) {
    return request('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, description, project_id: projectId })
    });
  },

  async getWorkspaceByProjectId(projectId) {
    return request(`/api/workspaces/by-project/${projectId}`);
  },

  // Mounts
  async listMounts(workspace) {
    const params = workspace ? `?workspace=${workspace}` : '';
    return request(`/api/mounts${params}`);
  },

  async resolveMount(path) {
    return request(`/api/mounts/resolve?path=${encodeURIComponent(path)}`);
  },

  async createMount(workspace, path, scope, tags) {
    return request('/api/mounts', {
      method: 'POST',
      body: JSON.stringify({ workspace, path, scope, tags })
    });
  },

  // Context
  async listContext(workspaceId, filters = {}) {
    const params = new URLSearchParams(filters).toString();
    const query = params ? `?${params}` : '';
    return request(`/api/context/${workspaceId}${query}`);
  },

  async getBrief(workspaceId, path, tags) {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    if (tags) params.set('tags', tags);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/context/${workspaceId}/brief${query}`);
  },

  async addContext(workspaceId, type, content, tags, scope, meta) {
    return request(`/api/context/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify({ type, content, tags, scope, meta })
    });
  },

  async linkContext(workspaceId, from, to, relation) {
    return request(`/api/context/${workspaceId}/link`, {
      method: 'POST',
      body: JSON.stringify({ from, to, relation })
    });
  },

  async getRelated(workspaceId, contextId, depth = 1) {
    return request(`/api/context/${workspaceId}/related/${contextId}?depth=${depth}`);
  },

  // Sync
  async syncPush(workspaceId, items) {
    return request(`/api/sync/${workspaceId}/batch`, {
      method: 'POST',
      body: JSON.stringify({ items })
    });
  },

  async syncPull(workspaceId, since = null) {
    const params = since ? `?since=${encodeURIComponent(since)}` : '';
    return request(`/api/sync/${workspaceId}/changes${params}`);
  },

  // Health
  async health() {
    return request('/health');
  },

  // Auth
  async init() {
    return request('/api/auth/init', {
      method: 'POST',
      body: JSON.stringify({})
    });
  },

  async signup(email) {
    return request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async verify(email, code) {
    return request('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code })
    });
  },

  async me() {
    return request('/api/auth/me');
  },

  async listKeys() {
    return request('/api/auth/keys');
  },

  async createKey(name) {
    return request('/api/auth/keys', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  },

  async revokeKey(id) {
    return request(`/api/auth/keys/${id}`, {
      method: 'DELETE'
    });
  },

  async createWorkspaceToken(workspaceId, name, scope, expiresInDays) {
    return request('/api/auth/tokens', {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: workspaceId,
        name,
        scope,
        expires_in_days: expiresInDays ? parseInt(expiresInDays) : undefined
      })
    });
  },

  async listWorkspaceTokens(workspaceId) {
    return request(`/api/auth/tokens/${workspaceId}`);
  },

  async revokeWorkspaceToken(id) {
    return request(`/api/auth/tokens/${id}`, {
      method: 'DELETE'
    });
  }
};
