#!/usr/bin/env node

/**
 * Substrate MCP Server
 *
 * Provides native tool access to Substrate for Claude Code and other MCP clients.
 * Use: substrate mcp serve
 *
 * Tools provided:
 * - substrate_brief: Get project context (with token budget support)
 * - substrate_add: Add context object
 * - substrate_search: Search context (replaces recall with better search)
 * - substrate_recall: Search context history (legacy, wraps search)
 * - substrate_digest: Session summary
 * - substrate_link: Create relationships between context objects
 * - substrate_session: Manage work sessions
 * - substrate_update: Update existing context objects
 * - substrate_delete: Soft-delete context objects
 *
 * Resources provided:
 * - substrate://workspace/current: Current workspace info
 * - substrate://context/constraints: All constraints
 * - substrate://session/active: Active session info
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { getDb, searchContext } from '../db/local.js';
import { getStrategy } from '../commands/config.js';
import { resolveStore } from '../lib/store.js';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { parseBudget, fitToBudget } from '../lib/tokens.js';
import { rankItems, buildLinkCounts } from '../lib/priority.js';
import { generateOverflowSummary } from '../lib/summarize.js';

const VALID_TYPES = ['note', 'constraint', 'decision', 'task', 'entity', 'runbook', 'snippet'];
const RELATION_TYPES = [
  'relates_to',
  'depends_on',
  'blocks',
  'implements',
  'extends',
  'references'
];

// Helper functions
// Resolve the context store for a path by discovering the enclosing `.substrate/`
// (walking up like git finds `.git`). Returns { root, workspace } or nulls.
function findWorkspaceForPath(db, targetPath) {
  const store = resolveStore(db, targetPath);
  if (!store) return { root: null, workspace: null };
  return { root: store.root, workspace: store.workspace };
}

function shortId(id) {
  return id ? id.substring(0, 8) : null;
}

function parseTimeAgo(hoursAgo) {
  const now = new Date();
  return new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
}

/**
 * Get links for a set of context item IDs.
 */
function getLinksForItems(db, itemIds) {
  if (itemIds.length === 0) return {};
  const placeholders = itemIds.map(() => '?').join(',');
  const links = db
    .prepare(
      `SELECT l.*, cf.content as from_content, cf.type as from_type, cf.id as from_id,
              ct.content as to_content, ct.type as to_type, ct.id as to_id
       FROM links l
       JOIN context cf ON l.from_id = cf.id
       JOIN context ct ON l.to_id = ct.id
       WHERE l.from_id IN (${placeholders}) OR l.to_id IN (${placeholders})`
    )
    .all(...itemIds, ...itemIds);

  const linkMap = {};
  for (const link of links) {
    if (!linkMap[link.from_id]) linkMap[link.from_id] = [];
    linkMap[link.from_id].push({
      direction: 'out',
      relation: link.relation,
      target: { id: shortId(link.to_id), content: link.to_content, type: link.to_type }
    });
    if (!linkMap[link.to_id]) linkMap[link.to_id] = [];
    linkMap[link.to_id].push({
      direction: 'in',
      relation: link.relation,
      source: { id: shortId(link.from_id), content: link.from_content, type: link.from_type }
    });
  }
  return linkMap;
}

/**
 * Build an error response with isError flag.
 */
function errorResponse(message) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true
  };
}

// ============================================================
// Tool implementations
// ============================================================

async function handleBrief(args) {
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { root, workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { _error: 'No workspace found for this path' };
  }

  // Query all context for workspace
  let query = 'SELECT * FROM context WHERE workspace_id = ? AND deleted_at IS NULL';
  const params = [workspace.id];

  // Type filter
  if (args.types && Array.isArray(args.types) && args.types.length > 0) {
    const typePlaceholders = args.types.map(() => '?').join(',');
    query += ` AND type IN (${typePlaceholders})`;
    params.push(...args.types);
  }

  query += ` ORDER BY CASE type WHEN 'constraint' THEN 1 WHEN 'decision' THEN 2 WHEN 'note' THEN 3 ELSE 4 END, created_at DESC`;

  const items = db.prepare(query).all(...params);

  // Parse JSON fields
  const parsed = items.map(item => ({
    ...item,
    tags: JSON.parse(item.tags || '[]'),
    meta: JSON.parse(item.meta || '{}')
  }));

  // Scope filtering
  const relativePath = root ? targetPath.replace(root, '').replace(/^\//, '') : '';
  let filtered = parsed.filter(item => {
    if (!item.scope || item.scope === '*') return true;
    if (relativePath.startsWith(item.scope)) return true;
    if (item.scope.startsWith(relativePath)) return true;
    return false;
  });

  // Tag filtering
  if (args.tags) {
    const filterTags = args.tags.split(',').map(t => t.trim());
    filtered = filtered.filter(item => {
      if (item.tags.length === 0) return true;
      return filterTags.some(t => item.tags.includes(t));
    });
  }

  // Get links
  const linkMap = getLinksForItems(
    db,
    filtered.map(i => i.id)
  );

  // Apply token budget if specified
  const budget = args.token_budget ? parseBudget(String(args.token_budget)) : null;
  let itemsForOutput = filtered;
  let overflowItems = [];
  let budgetInfo = null;

  if (budget) {
    const linkCounts = buildLinkCounts(linkMap);
    const filterTags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
    const ranked = rankItems(filtered, { currentPath: relativePath, filterTags, linkCounts });
    const result = fitToBudget(ranked, budget, { linkMap });
    itemsForOutput = result.included;
    overflowItems = result.overflow;
    budgetInfo = {
      tokens_used: result.tokenCount,
      budget,
      items_included: result.included.length,
      items_total: filtered.length
    };
  }

  // Generate prompt text
  const lines = [`## Project Context: ${workspace.name}`, ''];

  const byType = {
    constraint: {
      items: itemsForOutput.filter(i => i.type === 'constraint'),
      header: '### Constraints (treat as immutable facts)'
    },
    decision: {
      items: itemsForOutput.filter(i => i.type === 'decision'),
      header: '### Decisions (architectural choices made)'
    },
    note: { items: itemsForOutput.filter(i => i.type === 'note'), header: '### Notes' },
    task: { items: itemsForOutput.filter(i => i.type === 'task'), header: '### Active Tasks' },
    entity: { items: itemsForOutput.filter(i => i.type === 'entity'), header: '### Key Entities' },
    runbook: { items: itemsForOutput.filter(i => i.type === 'runbook'), header: '### Runbooks' },
    snippet: { items: itemsForOutput.filter(i => i.type === 'snippet'), header: '### Snippets' }
  };

  for (const [, { items: typeItems, header }] of Object.entries(byType)) {
    if (typeItems.length === 0) continue;
    lines.push(header);
    for (const item of typeItems) {
      const tagStr = item.tags?.length ? ` [${item.tags.join(', ')}]` : '';
      lines.push(`- ${item.content}${tagStr}`);
      const itemLinks = linkMap[item.id] || [];
      for (const l of itemLinks) {
        const arrow = l.direction === 'out' ? '→' : '←';
        const target = l.direction === 'out' ? l.target?.content : l.source?.content;
        lines.push(`  ${arrow} ${l.relation}: ${target}`);
      }
    }
    lines.push('');
  }

  let prompt = lines.join('\n').trim();

  // Append overflow summary if budget was applied
  if (budget && overflowItems.length > 0) {
    const summary = generateOverflowSummary(overflowItems);
    if (summary) prompt += '\n\n' + summary;
  }

  // Return prompt text directly for better agent consumption
  const result = { prompt, count: itemsForOutput.length };
  if (budgetInfo) result._budget = budgetInfo;

  return result;
}

async function handleAdd(args) {
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { _error: 'No workspace found for this path' };
  }

  if (!args.content) {
    return { _error: 'content is required' };
  }

  const type = VALID_TYPES.includes(args.type) ? args.type : 'note';
  const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
  const now = new Date().toISOString();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    workspace.id,
    type,
    args.content,
    JSON.stringify(tags),
    args.scope || '*',
    '{}',
    now,
    now
  );

  return { added: true, id: shortId(id), type, content: args.content, tags };
}

async function handleSearch(args) {
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { _error: 'No workspace found for this path' };
  }

  const limit = parseInt(args.limit || 20);
  let items;

  if (args.query) {
    // Use FTS5 full-text search
    items = searchContext(db, workspace.id, args.query, {
      type: args.type && VALID_TYPES.includes(args.type) ? args.type : undefined,
      limit
    });
  } else {
    // No query -- return recent items
    let sql = 'SELECT * FROM context WHERE workspace_id = ? AND deleted_at IS NULL';
    const params = [workspace.id];

    if (args.type && VALID_TYPES.includes(args.type)) {
      sql += ' AND type = ?';
      params.push(args.type);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    items = db.prepare(sql).all(...params);
  }

  items.forEach(item => {
    item.tags = JSON.parse(item.tags || '[]');
  });

  // Post-filter by tag (FTS doesn't handle this natively)
  if (args.tag) {
    items = items.filter(item => item.tags.includes(args.tag));
  }

  return {
    query: args.query || null,
    results: items.map(i => ({
      id: shortId(i.id),
      type: i.type,
      content: i.content,
      tags: i.tags,
      created: i.created_at
    })),
    count: items.length
  };
}

async function handleRecall(args) {
  // Legacy recall wraps search with time window
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { _error: 'No workspace found for this path' };
  }

  const hoursAgo = parseFloat(args.hours || 24);
  const cutoff = parseTimeAgo(hoursAgo);

  let sql =
    'SELECT * FROM context WHERE workspace_id = ? AND created_at >= ? AND deleted_at IS NULL';
  const params = [workspace.id, cutoff];

  if (args.query) {
    sql += ' AND content LIKE ?';
    params.push(`%${args.query}%`);
  }

  if (args.type && VALID_TYPES.includes(args.type)) {
    sql += ' AND type = ?';
    params.push(args.type);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(args.limit || 20));

  const items = db.prepare(sql).all(...params);
  items.forEach(item => {
    item.tags = JSON.parse(item.tags || '[]');
  });

  return {
    query: args.query || null,
    period: `last ${hoursAgo} hours`,
    results: items.map(i => ({
      id: shortId(i.id),
      type: i.type,
      content: i.content,
      tags: i.tags,
      created: i.created_at
    })),
    count: items.length
  };
}

async function handleDigest(args) {
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { _error: 'No workspace found for this path' };
  }

  const hoursAgo = parseFloat(args.hours || 8);
  const cutoff = parseTimeAgo(hoursAgo);

  const items = db
    .prepare(
      'SELECT * FROM context WHERE workspace_id = ? AND created_at >= ? AND deleted_at IS NULL ORDER BY created_at DESC'
    )
    .all(workspace.id, cutoff);

  items.forEach(item => {
    item.tags = JSON.parse(item.tags || '[]');
  });

  const summary = {};
  for (const type of VALID_TYPES) {
    const count = items.filter(i => i.type === type).length;
    if (count > 0) summary[type + 's'] = count;
  }

  return {
    workspace: workspace.name,
    period: `last ${hoursAgo} hours`,
    summary: { total: items.length, ...summary },
    items: items.map(i => ({ id: shortId(i.id), type: i.type, content: i.content, tags: i.tags }))
  };
}

async function handleLink(args) {
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { _error: 'No workspace found for this path' };
  }

  if (!args.from || !args.to) {
    return { _error: 'from and to IDs are required' };
  }

  const fromItem = db
    .prepare('SELECT * FROM context WHERE workspace_id = ? AND id LIKE ?')
    .get(workspace.id, `${args.from}%`);
  const toItem = db
    .prepare('SELECT * FROM context WHERE workspace_id = ? AND id LIKE ?')
    .get(workspace.id, `${args.to}%`);

  if (!fromItem) return { _error: `No context found with ID starting with '${args.from}'` };
  if (!toItem) return { _error: `No context found with ID starting with '${args.to}'` };

  const relation = RELATION_TYPES.includes(args.relation) ? args.relation : 'relates_to';
  const now = new Date().toISOString();

  db.prepare('INSERT INTO links (from_id, to_id, relation, created_at) VALUES (?, ?, ?, ?)').run(
    fromItem.id,
    toItem.id,
    relation,
    now
  );

  return {
    linked: true,
    from: { id: shortId(fromItem.id), content: fromItem.content },
    to: { id: shortId(toItem.id), content: toItem.content },
    relation
  };
}

async function handleSession(args) {
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { _error: 'No workspace found for this path' };
  }

  const action = args.action || 'status';

  if (action === 'start') {
    // End any existing active session first
    const active = db
      .prepare('SELECT * FROM sessions WHERE workspace_id = ? AND ended_at IS NULL')
      .get(workspace.id);
    if (active) {
      db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        active.id
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO sessions (id, workspace_id, name, started_at) VALUES (?, ?, ?, ?)').run(
      id,
      workspace.id,
      args.name || null,
      now
    );

    return { started: true, id: shortId(id), name: args.name || null, started_at: now };
  }

  if (action === 'end') {
    const active = db
      .prepare(
        'SELECT * FROM sessions WHERE workspace_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
      )
      .get(workspace.id);

    if (!active) {
      return { _error: 'No active session' };
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(now, active.id);

    // Count items added during session
    const count = db
      .prepare('SELECT COUNT(*) as count FROM context WHERE workspace_id = ? AND created_at >= ?')
      .get(workspace.id, active.started_at);

    return {
      ended: true,
      id: shortId(active.id),
      name: active.name,
      duration_minutes: Math.round((new Date(now) - new Date(active.started_at)) / 60000),
      items_added: count.count
    };
  }

  // status
  const active = db
    .prepare(
      'SELECT * FROM sessions WHERE workspace_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
    )
    .get(workspace.id);

  if (!active) {
    return { active: false, workspace: workspace.name };
  }

  const count = db
    .prepare('SELECT COUNT(*) as count FROM context WHERE workspace_id = ? AND created_at >= ?')
    .get(workspace.id, active.started_at);

  return {
    active: true,
    id: shortId(active.id),
    name: active.name,
    started_at: active.started_at,
    duration_minutes: Math.round((Date.now() - new Date(active.started_at).getTime()) / 60000),
    items_added: count.count,
    workspace: workspace.name
  };
}

async function handleUpdate(args) {
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { _error: 'No workspace found for this path' };
  }

  if (!args.id) {
    return { _error: 'id is required' };
  }

  const item = db
    .prepare('SELECT * FROM context WHERE workspace_id = ? AND id LIKE ? AND deleted_at IS NULL')
    .get(workspace.id, `${args.id}%`);

  if (!item) {
    return { _error: `No context found with ID starting with '${args.id}'` };
  }

  const updates = [];
  const params = [];

  if (args.content !== undefined) {
    updates.push('content = ?');
    params.push(args.content);
  }
  if (args.type && VALID_TYPES.includes(args.type)) {
    updates.push('type = ?');
    params.push(args.type);
  }
  if (args.tags !== undefined) {
    const tags = args.tags.split(',').map(t => t.trim());
    updates.push('tags = ?');
    params.push(JSON.stringify(tags));
  }
  if (args.scope !== undefined) {
    updates.push('scope = ?');
    params.push(args.scope);
  }

  if (updates.length === 0) {
    return { _error: 'No fields to update. Provide content, type, tags, or scope.' };
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(item.id);

  db.prepare(`UPDATE context SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  return { updated: true, id: shortId(item.id) };
}

async function handleDelete(args) {
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { _error: 'No workspace found for this path' };
  }

  if (!args.id) {
    return { _error: 'id is required' };
  }

  const item = db
    .prepare('SELECT * FROM context WHERE workspace_id = ? AND id LIKE ? AND deleted_at IS NULL')
    .get(workspace.id, `${args.id}%`);

  if (!item) {
    return { _error: `No context found with ID starting with '${args.id}'` };
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE context SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
    now,
    now,
    item.id
  );

  return { deleted: true, id: shortId(item.id), content: item.content };
}

// ============================================================
// MCP Server setup
// ============================================================

const server = new Server(
  { name: 'substrate', version: '0.2.0' },
  { capabilities: { tools: {}, resources: {} } }
);

// ============================================================
// List tools
// ============================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const strategy = getStrategy();
  if (strategy !== 'mcp') {
    return {
      tools: [
        {
          name: 'substrate_warning',
          description: `Substrate is in '${strategy}' mode. Switch to MCP mode with: substrate config strategy mcp`,
          inputSchema: { type: 'object', properties: {} }
        }
      ]
    };
  }

  return {
    tools: [
      {
        name: 'substrate_brief',
        description:
          'Get project context for the current directory. Supports token budgets for efficient context window usage. Returns prioritized constraints, decisions, notes, and more.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to get context for (default: cwd)' },
            token_budget: {
              type: 'number',
              description:
                'Max tokens to use. Presets: 2000 (small), 8000 (medium), 32000 (large), 100000 (xl). Default: unlimited.'
            },
            types: {
              type: 'array',
              items: { type: 'string', enum: VALID_TYPES },
              description: 'Filter by context types'
            },
            tags: { type: 'string', description: 'Comma-separated tag filter' }
          }
        }
      },
      {
        name: 'substrate_add',
        description:
          'Add a context object (constraint, decision, note, task, entity, runbook, or snippet)',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The context content' },
            type: {
              type: 'string',
              enum: VALID_TYPES,
              description: 'Type of context (default: note)'
            },
            tags: { type: 'string', description: 'Comma-separated tags' },
            scope: { type: 'string', description: 'Scope path pattern (default: * for global)' },
            path: { type: 'string', description: 'Working directory path' }
          },
          required: ['content']
        }
      },
      {
        name: 'substrate_search',
        description:
          'Search all context objects. More powerful than recall -- searches all time, supports type and tag filters.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term (searches content)' },
            type: { type: 'string', enum: VALID_TYPES, description: 'Filter by type' },
            tag: { type: 'string', description: 'Filter by tag' },
            limit: { type: 'number', description: 'Max results (default: 20)' },
            path: { type: 'string', description: 'Working directory path' }
          }
        }
      },
      {
        name: 'substrate_recall',
        description:
          'Search context from recent history (time-windowed). Use substrate_search for broader searches.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term' },
            type: { type: 'string', enum: VALID_TYPES, description: 'Filter by type' },
            hours: { type: 'number', description: 'Hours to look back (default: 24)' },
            limit: { type: 'number', description: 'Max results (default: 20)' },
            path: { type: 'string', description: 'Working directory path' }
          }
        }
      },
      {
        name: 'substrate_digest',
        description: 'Get summary of context added in current session or time window',
        inputSchema: {
          type: 'object',
          properties: {
            hours: { type: 'number', description: 'Hours to look back (default: 8)' },
            path: { type: 'string', description: 'Working directory path' }
          }
        }
      },
      {
        name: 'substrate_link',
        description: 'Create a relationship link between two context objects',
        inputSchema: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Source context short ID (first 8 chars)' },
            to: { type: 'string', description: 'Target context short ID (first 8 chars)' },
            relation: {
              type: 'string',
              enum: RELATION_TYPES,
              description: 'Relation type (default: relates_to)'
            },
            path: { type: 'string', description: 'Working directory path' }
          },
          required: ['from', 'to']
        }
      },
      {
        name: 'substrate_session',
        description:
          'Manage work sessions. Start/end sessions to track context additions over time.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['start', 'end', 'status'],
              description: 'Session action (default: status)'
            },
            name: { type: 'string', description: 'Session name (for start action)' },
            path: { type: 'string', description: 'Working directory path' }
          }
        }
      },
      {
        name: 'substrate_update',
        description: 'Update an existing context object by short ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Context short ID (first 8 chars)' },
            content: { type: 'string', description: 'New content' },
            type: { type: 'string', enum: VALID_TYPES, description: 'New type' },
            tags: { type: 'string', description: 'New comma-separated tags (replaces existing)' },
            scope: { type: 'string', description: 'New scope' },
            path: { type: 'string', description: 'Working directory path' }
          },
          required: ['id']
        }
      },
      {
        name: 'substrate_delete',
        description: 'Soft-delete a context object by short ID. Can be recovered via sync.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Context short ID (first 8 chars)' },
            path: { type: 'string', description: 'Working directory path' }
          },
          required: ['id']
        }
      }
    ]
  };
});

// ============================================================
// List resources
// ============================================================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'substrate://workspace/current',
        name: 'Current Workspace',
        description: 'Info about the workspace for the current directory',
        mimeType: 'application/json'
      },
      {
        uri: 'substrate://context/constraints',
        name: 'All Constraints',
        description: 'All constraint items (immutable facts) in the current workspace',
        mimeType: 'application/json'
      },
      {
        uri: 'substrate://session/active',
        name: 'Active Session',
        description: 'Currently active work session info and statistics',
        mimeType: 'application/json'
      }
    ]
  };
});

// ============================================================
// Read resources
// ============================================================

server.setRequestHandler(ReadResourceRequestSchema, async request => {
  const uri = request.params.uri;
  const db = getDb();
  const targetPath = resolve(process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return {
      contents: [
        { uri, mimeType: 'application/json', text: JSON.stringify({ error: 'No workspace found' }) }
      ]
    };
  }

  if (uri === 'substrate://workspace/current') {
    const itemCount = db
      .prepare(
        'SELECT COUNT(*) as count FROM context WHERE workspace_id = ? AND deleted_at IS NULL'
      )
      .get(workspace.id);
    const linkCount = db
      .prepare(
        'SELECT COUNT(*) as count FROM links l JOIN context c ON l.from_id = c.id WHERE c.workspace_id = ?'
      )
      .get(workspace.id);

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              id: shortId(workspace.id),
              name: workspace.name,
              description: workspace.description,
              project_id: workspace.project_id,
              items: itemCount.count,
              links: linkCount.count,
              created_at: workspace.created_at
            },
            null,
            2
          )
        }
      ]
    };
  }

  if (uri === 'substrate://context/constraints') {
    const constraints = db
      .prepare(
        'SELECT * FROM context WHERE workspace_id = ? AND type = ? AND deleted_at IS NULL ORDER BY created_at DESC'
      )
      .all(workspace.id, 'constraint');

    constraints.forEach(c => {
      c.tags = JSON.parse(c.tags || '[]');
    });

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(
            constraints.map(c => ({
              id: shortId(c.id),
              content: c.content,
              tags: c.tags,
              scope: c.scope,
              created: c.created_at
            })),
            null,
            2
          )
        }
      ]
    };
  }

  if (uri === 'substrate://session/active') {
    const active = db
      .prepare(
        'SELECT * FROM sessions WHERE workspace_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
      )
      .get(workspace.id);

    if (!active) {
      return {
        contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ active: false }) }]
      };
    }

    const count = db
      .prepare('SELECT COUNT(*) as count FROM context WHERE workspace_id = ? AND created_at >= ?')
      .get(workspace.id, active.started_at);

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              active: true,
              id: shortId(active.id),
              name: active.name,
              started_at: active.started_at,
              duration_minutes: Math.round(
                (Date.now() - new Date(active.started_at).getTime()) / 60000
              ),
              items_added: count.count
            },
            null,
            2
          )
        }
      ]
    };
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ error: `Unknown resource: ${uri}` })
      }
    ]
  };
});

// ============================================================
// Handle tool calls
// ============================================================

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;

  // Check strategy
  const strategy = getStrategy();
  if (strategy !== 'mcp' && name !== 'substrate_warning') {
    return errorResponse(
      `Substrate is in '${strategy}' mode. Switch to MCP mode with: substrate config strategy mcp`
    );
  }

  let result;
  try {
    switch (name) {
      case 'substrate_brief':
        result = await handleBrief(args || {});
        break;
      case 'substrate_add':
        result = await handleAdd(args || {});
        break;
      case 'substrate_search':
        result = await handleSearch(args || {});
        break;
      case 'substrate_recall':
        result = await handleRecall(args || {});
        break;
      case 'substrate_digest':
        result = await handleDigest(args || {});
        break;
      case 'substrate_link':
        result = await handleLink(args || {});
        break;
      case 'substrate_session':
        result = await handleSession(args || {});
        break;
      case 'substrate_update':
        result = await handleUpdate(args || {});
        break;
      case 'substrate_delete':
        result = await handleDelete(args || {});
        break;
      default:
        result = { _error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return errorResponse(err.message);
  }

  // Handle error responses with isError flag
  if (result && result._error) {
    return errorResponse(result._error);
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
  };
});

// Start server
export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Substrate MCP server v0.2.0 running');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer().catch(console.error);
}
