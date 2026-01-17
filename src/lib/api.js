/**
 * HTTP API client for the Substrate remote server.
 *
 * This module provides the client for communicating with the Substrate REST API.
 * All methods automatically:
 * - Include authentication headers when available
 * - Handle offline scenarios gracefully
 * - Parse JSON responses
 *
 * ## Authentication
 *
 * The API key is loaded from `~/.substrate/auth.json` automatically.
 * To authenticate, run `substrate auth init` first.
 *
 * ## Offline Handling
 *
 * When the server is unreachable, methods return `{ offline: true, error: string }`
 * instead of throwing. This supports the offline-first architecture.
 *
 * @module lib/api
 */

import { getApiUrl } from './config.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Base URL for the Substrate API server.
 * @type {string}
 * @private
 */
const BASE_URL = getApiUrl();

/**
 * Path to the authentication credentials file.
 * @type {string}
 * @private
 */
const AUTH_FILE = join(homedir(), '.substrate', 'auth.json');

/**
 * Load the API key from the local auth config file.
 *
 * Reads `~/.substrate/auth.json` and extracts the `api_key` field.
 * Returns null if the file doesn't exist or is invalid.
 *
 * @returns {string|null} The API key if found, null otherwise
 * @private
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

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} [offline] - True if the server is unreachable
 * @property {string} [error] - Error message if request failed
 */

/**
 * @typedef {Object} WorkspaceResponse
 * @property {string} id - Workspace UUID
 * @property {string} name - Workspace name
 * @property {string} [description] - Optional description
 * @property {string} project_id - Unique project identifier
 * @property {string} created_at - ISO 8601 timestamp
 * @property {string} updated_at - ISO 8601 timestamp
 */

/**
 * @typedef {Object} ContextResponse
 * @property {string} id - Context item UUID
 * @property {string} workspace_id - Parent workspace UUID
 * @property {string} type - Context type (note, constraint, decision, etc.)
 * @property {string} content - The text content
 * @property {string[]} tags - Array of tags
 * @property {string} scope - Scope path pattern
 * @property {Object} meta - Metadata object
 * @property {string} created_at - ISO 8601 timestamp
 * @property {string} updated_at - ISO 8601 timestamp
 */

/**
 * @typedef {Object} BriefResponse
 * @property {ContextResponse[]} items - Array of context items
 * @property {Object[]} links - Array of link relationships
 * @property {string} workspace_name - Name of the workspace
 */

/**
 * Make an authenticated HTTP request to the Substrate API.
 *
 * Automatically:
 * - Adds Content-Type: application/json header
 * - Includes Bearer token if authenticated
 * - Parses JSON response
 * - Returns offline indicator on connection failure
 *
 * @param {string} path - The API endpoint path (e.g., '/api/workspaces')
 * @param {Object} [options] - Fetch options (method, body, headers, etc.)
 * @returns {Promise<ApiResponse|Object>} Parsed JSON response or offline indicator
 * @throws {Error} For HTTP errors with error message from response
 * @private
 *
 * @example
 * // GET request
 * const workspaces = await request('/api/workspaces');
 *
 * @example
 * // POST request
 * const created = await request('/api/workspaces', {
 *   method: 'POST',
 *   body: JSON.stringify({ name: 'myproject' })
 * });
 */
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

/**
 * Substrate API client object.
 *
 * Provides methods for all Substrate REST API endpoints grouped by resource:
 * - **Workspaces** - Create, list, and retrieve workspaces
 * - **Mounts** - Directory-to-workspace mappings
 * - **Context** - Context items and relationships
 * - **Sync** - Push/pull synchronization
 * - **Auth** - Authentication and API keys
 *
 * @namespace api
 *
 * @example
 * import { api } from './lib/api.js';
 *
 * // List all workspaces
 * const workspaces = await api.listWorkspaces();
 *
 * // Add context
 * await api.addContext(workspaceId, 'constraint', 'Must use JSON', ['api']);
 */
export const api = {
  // ═══════════════════════════════════════════════════════════════════════════
  // WORKSPACES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * List all workspaces for the authenticated user.
   *
   * @returns {Promise<WorkspaceResponse[]|ApiResponse>} Array of workspaces or offline indicator
   *
   * @example
   * const workspaces = await api.listWorkspaces();
   * workspaces.forEach(ws => console.log(ws.name));
   */
  async listWorkspaces() {
    return request('/api/workspaces');
  },

  /**
   * Get a workspace by its ID.
   *
   * @param {string} id - The workspace UUID
   * @returns {Promise<WorkspaceResponse|ApiResponse>} The workspace or offline indicator
   *
   * @example
   * const workspace = await api.getWorkspace('550e8400-e29b-41d4-a716-446655440000');
   */
  async getWorkspace(id) {
    return request(`/api/workspaces/${id}`);
  },

  /**
   * Create a new workspace.
   *
   * @param {string} name - Workspace display name
   * @param {string} [description] - Optional description
   * @param {string} [projectId] - Optional project ID (UUID) for pinning
   * @returns {Promise<WorkspaceResponse|ApiResponse>} The created workspace or offline indicator
   *
   * @example
   * const workspace = await api.createWorkspace('myproject', 'Main API service');
   */
  async createWorkspace(name, description, projectId) {
    return request('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, description, project_id: projectId })
    });
  },

  /**
   * Get a workspace by its project ID.
   *
   * Used for project pinning - looks up workspace by the stable project identifier
   * rather than the internal UUID.
   *
   * @param {string} projectId - The project ID (UUID stored in .substrate/config.json)
   * @returns {Promise<WorkspaceResponse|ApiResponse>} The workspace or offline indicator
   *
   * @example
   * const workspace = await api.getWorkspaceByProjectId(projectId);
   */
  async getWorkspaceByProjectId(projectId) {
    return request(`/api/workspaces/by-project/${projectId}`);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MOUNTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * List mounts, optionally filtered by workspace.
   *
   * @param {string} [workspace] - Optional workspace name to filter by
   * @returns {Promise<Object[]|ApiResponse>} Array of mount objects or offline indicator
   *
   * @example
   * // List all mounts
   * const mounts = await api.listMounts();
   *
   * @example
   * // List mounts for specific workspace
   * const mounts = await api.listMounts('myproject');
   */
  async listMounts(workspace) {
    const params = workspace ? `?workspace=${workspace}` : '';
    return request(`/api/mounts${params}`);
  },

  /**
   * Resolve a filesystem path to its workspace mount.
   *
   * Given an absolute path, finds the workspace mount that contains it.
   *
   * @param {string} path - Absolute filesystem path
   * @returns {Promise<Object|ApiResponse>} Mount info with workspace details or offline indicator
   *
   * @example
   * const mount = await api.resolveMount('/Users/dev/myproject/src');
   * console.log(mount.workspace.name);
   */
  async resolveMount(path) {
    return request(`/api/mounts/resolve?path=${encodeURIComponent(path)}`);
  },

  /**
   * Create a new mount linking a directory to a workspace.
   *
   * @param {string} workspace - Workspace name
   * @param {string} path - Absolute filesystem path to mount
   * @param {string} [scope] - Scope pattern within the mount (default: '*')
   * @param {string[]} [tags] - Tags to apply to context from this mount
   * @returns {Promise<Object|ApiResponse>} The created mount or offline indicator
   *
   * @example
   * await api.createMount('myproject', '/Users/dev/myproject', '*', ['backend']);
   */
  async createMount(workspace, path, scope, tags) {
    return request('/api/mounts', {
      method: 'POST',
      body: JSON.stringify({ workspace, path, scope, tags })
    });
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * List context items for a workspace with optional filters.
   *
   * @param {string} workspaceId - The workspace UUID
   * @param {Object} [filters] - Optional filter parameters
   * @param {string} [filters.type] - Filter by context type
   * @param {string} [filters.tag] - Filter by tag
   * @param {number} [filters.limit] - Maximum number of results
   * @returns {Promise<ContextResponse[]|ApiResponse>} Array of context items or offline indicator
   *
   * @example
   * // List all context
   * const items = await api.listContext(workspaceId);
   *
   * @example
   * // Filter by type
   * const constraints = await api.listContext(workspaceId, { type: 'constraint' });
   */
  async listContext(workspaceId, filters = {}) {
    const params = new URLSearchParams(filters).toString();
    const query = params ? `?${params}` : '';
    return request(`/api/context/${workspaceId}${query}`);
  },

  /**
   * Get a context brief for a workspace, optionally scoped to a path.
   *
   * Returns context items applicable to the given path, with related items
   * included via graph traversal.
   *
   * @param {string} workspaceId - The workspace UUID
   * @param {string} [path] - Optional path to scope the brief to
   * @param {string} [tags] - Optional comma-separated tags to filter by
   * @returns {Promise<BriefResponse|ApiResponse>} Brief with items and links or offline indicator
   *
   * @example
   * // Get full workspace brief
   * const brief = await api.getBrief(workspaceId);
   *
   * @example
   * // Get brief scoped to a path
   * const brief = await api.getBrief(workspaceId, 'src/api/', 'auth,security');
   */
  async getBrief(workspaceId, path, tags) {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    if (tags) params.set('tags', tags);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/context/${workspaceId}/brief${query}`);
  },

  /**
   * Add a new context item to a workspace.
   *
   * @param {string} workspaceId - The workspace UUID
   * @param {string} type - Context type (note, constraint, decision, task, entity, runbook, snippet)
   * @param {string} content - The text content
   * @param {string[]} [tags] - Optional array of tags
   * @param {string} [scope] - Optional scope pattern (default: '*')
   * @param {Object} [meta] - Optional metadata object
   * @returns {Promise<ContextResponse|ApiResponse>} The created context item or offline indicator
   *
   * @example
   * await api.addContext(workspaceId, 'constraint', 'All dates must be ISO 8601', ['api', 'format']);
   *
   * @example
   * await api.addContext(workspaceId, 'decision', 'Using PostgreSQL for persistence', [], '*', { reason: 'Team expertise' });
   */
  async addContext(workspaceId, type, content, tags, scope, meta) {
    return request(`/api/context/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify({ type, content, tags, scope, meta })
    });
  },

  /**
   * Create a link between two context items.
   *
   * @param {string} workspaceId - The workspace UUID
   * @param {string} from - Source context item UUID (or short ID)
   * @param {string} to - Target context item UUID (or short ID)
   * @param {string} [relation] - Relationship type (default: 'relates_to')
   * @returns {Promise<Object|ApiResponse>} The created link or offline indicator
   *
   * @example
   * await api.linkContext(workspaceId, 'abc12345', 'def67890', 'implements');
   */
  async linkContext(workspaceId, from, to, relation) {
    return request(`/api/context/${workspaceId}/link`, {
      method: 'POST',
      body: JSON.stringify({ from, to, relation })
    });
  },

  /**
   * Get related context items via graph traversal.
   *
   * Traverses the context graph from a starting item, returning all
   * connected items within the specified depth.
   *
   * @param {string} workspaceId - The workspace UUID
   * @param {string} contextId - The starting context item UUID (or short ID)
   * @param {number} [depth=1] - Traversal depth (1 or 2)
   * @returns {Promise<Object|ApiResponse>} Related items grouped by distance or offline indicator
   *
   * @example
   * const related = await api.getRelated(workspaceId, 'abc12345', 2);
   */
  async getRelated(workspaceId, contextId, depth = 1) {
    return request(`/api/context/${workspaceId}/related/${contextId}?depth=${depth}`);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Push local changes to the remote server.
   *
   * Sends a batch of context items to be synced to the server.
   * Items include their local IDs and the server returns remote IDs.
   *
   * @param {string} workspaceId - The workspace UUID
   * @param {Object[]} items - Array of context items to sync
   * @returns {Promise<Object|ApiResponse>} Sync result with remote IDs or offline indicator
   *
   * @example
   * const result = await api.syncPush(workspaceId, unsyncedItems);
   */
  async syncPush(workspaceId, items) {
    return request(`/api/sync/${workspaceId}/batch`, {
      method: 'POST',
      body: JSON.stringify({ items })
    });
  },

  /**
   * Pull remote changes since a given timestamp.
   *
   * Fetches all context items that have been modified on the server
   * since the specified timestamp.
   *
   * @param {string} workspaceId - The workspace UUID
   * @param {string} [since] - ISO 8601 timestamp to fetch changes since (null for all)
   * @returns {Promise<Object|ApiResponse>} Array of changed items or offline indicator
   *
   * @example
   * // Pull all changes
   * const changes = await api.syncPull(workspaceId);
   *
   * @example
   * // Pull changes since last sync
   * const changes = await api.syncPull(workspaceId, lastSyncedAt);
   */
  async syncPull(workspaceId, since = null) {
    const params = since ? `?since=${encodeURIComponent(since)}` : '';
    return request(`/api/sync/${workspaceId}/changes${params}`);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check API server health.
   *
   * @returns {Promise<Object|ApiResponse>} Health status or offline indicator
   *
   * @example
   * const health = await api.health();
   * if (!health.offline) console.log('Server is online');
   */
  async health() {
    return request('/health');
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize anonymous authentication.
   *
   * Creates an anonymous account and returns API credentials.
   * This is the primary authentication method for new users.
   *
   * @returns {Promise<Object|ApiResponse>} Auth credentials (user_id, api_key) or offline indicator
   *
   * @example
   * const auth = await api.init();
   * // Save auth.api_key to ~/.substrate/auth.json
   */
  async init() {
    return request('/api/auth/init', {
      method: 'POST',
      body: JSON.stringify({})
    });
  },

  /**
   * Start email-based signup flow.
   *
   * Sends a verification code to the provided email address.
   *
   * @param {string} email - Email address to register
   * @returns {Promise<Object|ApiResponse>} Success status or offline indicator
   *
   * @example
   * await api.signup('user@example.com');
   * // User receives verification code via email
   */
  async signup(email) {
    return request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  /**
   * Verify email with code and complete signup.
   *
   * @param {string} email - Email address being verified
   * @param {string} code - Verification code from email
   * @returns {Promise<Object|ApiResponse>} Auth credentials on success or offline indicator
   *
   * @example
   * const auth = await api.verify('user@example.com', '123456');
   */
  async verify(email, code) {
    return request('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code })
    });
  },

  /**
   * Get current authenticated user info.
   *
   * @returns {Promise<Object|ApiResponse>} User info (id, email, type) or offline indicator
   *
   * @example
   * const user = await api.me();
   * console.log(`Logged in as: ${user.email || 'anonymous'}`);
   */
  async me() {
    return request('/api/auth/me');
  },

  /**
   * List API keys for the current user.
   *
   * @returns {Promise<Object[]|ApiResponse>} Array of API key info or offline indicator
   *
   * @example
   * const keys = await api.listKeys();
   * keys.forEach(k => console.log(k.name, k.created_at));
   */
  async listKeys() {
    return request('/api/auth/keys');
  },

  /**
   * Create a new API key.
   *
   * @param {string} name - Display name for the key
   * @returns {Promise<Object|ApiResponse>} Created key with secret (only shown once) or offline indicator
   *
   * @example
   * const key = await api.createKey('CI/CD Pipeline');
   * console.log(`New key: ${key.api_key}`); // Only shown once!
   */
  async createKey(name) {
    return request('/api/auth/keys', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  },

  /**
   * Revoke an API key.
   *
   * @param {string} id - The API key ID to revoke
   * @returns {Promise<Object|ApiResponse>} Success status or offline indicator
   *
   * @example
   * await api.revokeKey('key-id-to-revoke');
   */
  async revokeKey(id) {
    return request(`/api/auth/keys/${id}`, {
      method: 'DELETE'
    });
  },

  /**
   * Create a workspace-scoped token.
   *
   * Workspace tokens provide limited access to a single workspace,
   * ideal for CI/CD pipelines or agent integrations.
   *
   * @param {string} workspaceId - The workspace UUID
   * @param {string} name - Display name for the token
   * @param {string} [scope] - Access scope: 'read' or 'read_write' (default: 'read_write')
   * @param {string|number} [expiresInDays] - Token expiration in days (optional)
   * @returns {Promise<Object|ApiResponse>} Created token with secret or offline indicator
   *
   * @example
   * // Create read-only token for CI
   * const token = await api.createWorkspaceToken(workspaceId, 'GitHub Actions', 'read', 30);
   */
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

  /**
   * List tokens for a workspace.
   *
   * @param {string} workspaceId - The workspace UUID
   * @returns {Promise<Object[]|ApiResponse>} Array of token info or offline indicator
   *
   * @example
   * const tokens = await api.listWorkspaceTokens(workspaceId);
   */
  async listWorkspaceTokens(workspaceId) {
    return request(`/api/auth/tokens/${workspaceId}`);
  },

  /**
   * Revoke a workspace token.
   *
   * @param {string} id - The token ID to revoke
   * @returns {Promise<Object|ApiResponse>} Success status or offline indicator
   *
   * @example
   * await api.revokeWorkspaceToken('token-id-to-revoke');
   */
  async revokeWorkspaceToken(id) {
    return request(`/api/auth/tokens/${id}`, {
      method: 'DELETE'
    });
  }
};
