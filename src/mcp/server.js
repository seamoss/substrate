#!/usr/bin/env node

/**
 * Substrate MCP Server
 *
 * Provides native tool access to Substrate for Claude Code
 * Use: substrate mcp serve
 *
 * Tools provided:
 * - substrate_brief: Get project context
 * - substrate_add: Add context object
 * - substrate_recall: Search context history
 * - substrate_digest: Session summary
 * - substrate_extract: Extraction checklist
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { getDb } from '../db/local.js';
import { getStrategy } from '../commands/config.js';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

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
function findWorkspaceForPath(db, targetPath) {
  const mounts = db.prepare('SELECT * FROM mounts ORDER BY length(path) DESC').all();
  for (const mount of mounts) {
    if (targetPath.startsWith(mount.path)) {
      return {
        mount,
        workspace: db.prepare('SELECT * FROM workspaces WHERE id = ?').get(mount.workspace_id)
      };
    }
  }
  return { mount: null, workspace: null };
}

function shortId(id) {
  return id ? id.substring(0, 8) : null;
}

function parseTimeAgo(hoursAgo) {
  const now = new Date();
  return new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
}

// Tool implementations
async function handleBrief(args) {
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { error: 'No workspace found for this path' };
  }

  const items = db
    .prepare(
      `
    SELECT * FROM context WHERE workspace_id = ?
    ORDER BY CASE type WHEN 'constraint' THEN 1 WHEN 'decision' THEN 2 WHEN 'note' THEN 3 ELSE 4 END
  `
    )
    .all(workspace.id);

  items.forEach(item => {
    item.tags = JSON.parse(item.tags || '[]');
  });

  // Generate prompt
  const lines = [`## Project Context: ${workspace.name}`, ''];

  const constraints = items.filter(i => i.type === 'constraint');
  const decisions = items.filter(i => i.type === 'decision');
  const notes = items.filter(i => i.type === 'note');

  if (constraints.length > 0) {
    lines.push('### Constraints (treat as immutable facts)');
    constraints.forEach(c => lines.push(`- ${c.content}`));
    lines.push('');
  }

  if (decisions.length > 0) {
    lines.push('### Decisions (architectural choices made)');
    decisions.forEach(d => lines.push(`- ${d.content}`));
    lines.push('');
  }

  if (notes.length > 0) {
    lines.push('### Notes');
    notes.forEach(n => lines.push(`- ${n.content}`));
    lines.push('');
  }

  return {
    workspace: workspace.name,
    prompt: lines.join('\n').trim(),
    context: {
      constraints: constraints.map(c => ({ content: c.content, tags: c.tags })),
      decisions: decisions.map(d => ({ content: d.content, tags: d.tags })),
      notes: notes.map(n => ({ content: n.content, tags: n.tags }))
    },
    count: items.length
  };
}

async function handleAdd(args) {
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { error: 'No workspace found for this path' };
  }

  if (!args.content) {
    return { error: 'content is required' };
  }

  const type = VALID_TYPES.includes(args.type) ? args.type : 'note';
  const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
  const now = new Date().toISOString();
  const id = randomUUID();

  db.prepare(
    `
    INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
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

  return {
    added: true,
    id: shortId(id),
    type,
    content: args.content,
    tags
  };
}

async function handleRecall(args) {
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { error: 'No workspace found for this path' };
  }

  const hoursAgo = parseFloat(args.hours || 24);
  const cutoff = parseTimeAgo(hoursAgo);

  let sql = 'SELECT * FROM context WHERE workspace_id = ? AND created_at >= ?';
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
    return { error: 'No workspace found for this path' };
  }

  const hoursAgo = parseFloat(args.hours || 8);
  const cutoff = parseTimeAgo(hoursAgo);

  const items = db
    .prepare(
      `
    SELECT * FROM context WHERE workspace_id = ? AND created_at >= ?
    ORDER BY created_at DESC
  `
    )
    .all(workspace.id, cutoff);

  items.forEach(item => {
    item.tags = JSON.parse(item.tags || '[]');
  });

  const byType = {
    constraint: items.filter(i => i.type === 'constraint'),
    decision: items.filter(i => i.type === 'decision'),
    note: items.filter(i => i.type === 'note'),
    task: items.filter(i => i.type === 'task'),
    entity: items.filter(i => i.type === 'entity')
  };

  return {
    workspace: workspace.name,
    period: `last ${hoursAgo} hours`,
    summary: {
      total: items.length,
      constraints: byType.constraint.length,
      decisions: byType.decision.length,
      notes: byType.note.length,
      tasks: byType.task.length,
      entities: byType.entity.length
    },
    items: items.map(i => ({
      id: shortId(i.id),
      type: i.type,
      content: i.content,
      tags: i.tags
    }))
  };
}

async function handleLink(args) {
  const db = getDb();
  const targetPath = resolve(args.path || process.cwd());
  const { workspace } = findWorkspaceForPath(db, targetPath);

  if (!workspace) {
    return { error: 'No workspace found for this path' };
  }

  if (!args.from || !args.to) {
    return { error: 'from and to IDs are required' };
  }

  // Find items by short ID
  const fromItem = db
    .prepare('SELECT * FROM context WHERE workspace_id = ? AND id LIKE ?')
    .get(workspace.id, `${args.from}%`);
  const toItem = db
    .prepare('SELECT * FROM context WHERE workspace_id = ? AND id LIKE ?')
    .get(workspace.id, `${args.to}%`);

  if (!fromItem) return { error: `No context found with ID starting with '${args.from}'` };
  if (!toItem) return { error: `No context found with ID starting with '${args.to}'` };

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

// MCP Server setup
const server = new Server({ name: 'substrate', version: '0.1.0' }, { capabilities: { tools: {} } });

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Check strategy
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
          'Get project context for the current directory. Returns constraints, decisions, and notes.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to get context for (default: cwd)' }
          }
        }
      },
      {
        name: 'substrate_add',
        description: 'Add a context object (constraint, decision, note, etc.)',
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
            scope: { type: 'string', description: 'Scope path (default: *)' },
            path: { type: 'string', description: 'Working directory path' }
          },
          required: ['content']
        }
      },
      {
        name: 'substrate_recall',
        description: 'Search and recall context from session history',
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
        description: 'Get summary of context added in current session',
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
            from: { type: 'string', description: 'Source context short ID' },
            to: { type: 'string', description: 'Target context short ID' },
            relation: {
              type: 'string',
              enum: RELATION_TYPES,
              description: 'Relation type (default: relates_to)'
            },
            path: { type: 'string', description: 'Working directory path' }
          },
          required: ['from', 'to']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;

  // Check strategy
  const strategy = getStrategy();
  if (strategy !== 'mcp' && name !== 'substrate_warning') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `Substrate is in '${strategy}' mode. Switch to MCP mode with: substrate config strategy mcp`
          })
        }
      ]
    };
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
      case 'substrate_recall':
        result = await handleRecall(args || {});
        break;
      case 'substrate_digest':
        result = await handleDigest(args || {});
        break;
      case 'substrate_link':
        result = await handleLink(args || {});
        break;
      default:
        result = { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
});

// Start server
export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Substrate MCP server running');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer().catch(console.error);
}
