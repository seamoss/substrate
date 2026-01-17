import { Command } from 'commander';
import { resolve } from 'path';
import { getDb } from '../db/local.js';
import { formatJson, heading, contextItem, info, dim, shortId } from '../lib/output.js';
import chalk from 'chalk';

const VALID_FORMATS = ['default', 'agent', 'markdown'];

function findMountForPath(db, targetPath) {
  const mounts = db.prepare('SELECT * FROM mounts ORDER BY length(path) DESC').all();

  for (const mount of mounts) {
    if (targetPath.startsWith(mount.path)) {
      return mount;
    }
  }

  return null;
}

function getLinksForItems(db, itemIds) {
  if (itemIds.length === 0) return {};

  const placeholders = itemIds.map(() => '?').join(',');
  const links = db
    .prepare(
      `
    SELECT l.*,
           cf.content as from_content, cf.type as from_type, cf.id as from_id,
           ct.content as to_content, ct.type as to_type, ct.id as to_id
    FROM links l
    JOIN context cf ON l.from_id = cf.id
    JOIN context ct ON l.to_id = ct.id
    WHERE l.from_id IN (${placeholders}) OR l.to_id IN (${placeholders})
  `
    )
    .all(...itemIds, ...itemIds);

  // Group links by item id
  const linkMap = {};
  for (const link of links) {
    // Add to source item
    if (!linkMap[link.from_id]) linkMap[link.from_id] = [];
    linkMap[link.from_id].push({
      direction: 'out',
      relation: link.relation,
      target: {
        id: shortId(link.to_id),
        content: link.to_content,
        type: link.to_type
      }
    });

    // Add to target item
    if (!linkMap[link.to_id]) linkMap[link.to_id] = [];
    linkMap[link.to_id].push({
      direction: 'in',
      relation: link.relation,
      source: {
        id: shortId(link.from_id),
        content: link.from_content,
        type: link.from_type
      }
    });
  }

  return linkMap;
}

function slimContext(item, linkMap) {
  const slim = { content: item.content };
  if (item.tags && item.tags.length > 0) slim.tags = item.tags;
  if (item.scope && item.scope !== '*') slim.scope = item.scope;

  // Add links if present
  const links = linkMap[item.id];
  if (links && links.length > 0) {
    slim.links = links.map(l => {
      if (l.direction === 'out') {
        return { relation: l.relation, to: l.target.content };
      } else {
        return { relation: l.relation, from: l.source.content };
      }
    });
  }

  return slim;
}

function generatePrompt(brief, _linkMap, _filtered) {
  const lines = [];

  lines.push(`## Project Context: ${brief.workspace}`);
  lines.push('');

  if (brief.constraints.length > 0) {
    lines.push('### Constraints (treat as immutable facts)');
    brief.constraints.forEach(c => {
      const tagStr = c.tags?.length ? ` [${c.tags.join(', ')}]` : '';
      lines.push(`- ${c.content}${tagStr}`);
      if (c.links?.length) {
        c.links.forEach(l => {
          const arrow = l.to ? '→' : '←';
          const target = l.to || l.from;
          lines.push(`  ${arrow} ${l.relation}: ${target}`);
        });
      }
    });
    lines.push('');
  }

  if (brief.decisions.length > 0) {
    lines.push('### Decisions (architectural choices made)');
    brief.decisions.forEach(d => {
      const tagStr = d.tags?.length ? ` [${d.tags.join(', ')}]` : '';
      lines.push(`- ${d.content}${tagStr}`);
      if (d.links?.length) {
        d.links.forEach(l => {
          const arrow = l.to ? '→' : '←';
          const target = l.to || l.from;
          lines.push(`  ${arrow} ${l.relation}: ${target}`);
        });
      }
    });
    lines.push('');
  }

  if (brief.notes.length > 0) {
    lines.push('### Notes');
    brief.notes.forEach(n => {
      const tagStr = n.tags?.length ? ` [${n.tags.join(', ')}]` : '';
      lines.push(`- ${n.content}${tagStr}`);
      if (n.links?.length) {
        n.links.forEach(l => {
          const arrow = l.to ? '→' : '←';
          const target = l.to || l.from;
          lines.push(`  ${arrow} ${l.relation}: ${target}`);
        });
      }
    });
    lines.push('');
  }

  if (brief.tasks.length > 0) {
    lines.push('### Active Tasks');
    brief.tasks.forEach(t => {
      lines.push(`- ${t.content}`);
      if (t.links?.length) {
        t.links.forEach(l => {
          const arrow = l.to ? '→' : '←';
          const target = l.to || l.from;
          lines.push(`  ${arrow} ${l.relation}: ${target}`);
        });
      }
    });
    lines.push('');
  }

  if (brief.entities.length > 0) {
    lines.push('### Key Entities');
    brief.entities.forEach(e => {
      lines.push(`- ${e.content}`);
      if (e.links?.length) {
        e.links.forEach(l => {
          const arrow = l.to ? '→' : '←';
          const target = l.to || l.from;
          lines.push(`  ${arrow} ${l.relation}: ${target}`);
        });
      }
    });
    lines.push('');
  }

  return lines.join('\n').trim();
}

function getActiveSession(db, workspaceId) {
  return db
    .prepare(
      'SELECT * FROM sessions WHERE workspace_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
    )
    .get(workspaceId);
}

function formatDuration(startedAt) {
  const start = new Date(startedAt);
  const now = new Date();
  const diffMs = now - start;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function generateAgentFormat(brief, workspace, session) {
  const lines = [];

  // Header with workspace and session info
  lines.push('# SUBSTRATE CONTEXT');
  lines.push(`Workspace: ${workspace.name}`);
  if (session) {
    lines.push(`Session: ${session.name || 'active'} (${formatDuration(session.started_at)})`);
  }
  lines.push('');

  // Priority context first (constraints are immutable)
  if (brief.constraints.length > 0) {
    lines.push('## CONSTRAINTS (Treat as hard requirements)');
    brief.constraints.forEach(c => {
      lines.push(`* ${c.content}`);
    });
    lines.push('');
  }

  // Decisions next
  if (brief.decisions.length > 0) {
    lines.push('## DECISIONS (Follow these architectural choices)');
    brief.decisions.forEach(d => {
      lines.push(`* ${d.content}`);
    });
    lines.push('');
  }

  // Notes provide context
  if (brief.notes.length > 0) {
    lines.push('## CONTEXT');
    brief.notes.forEach(n => {
      lines.push(`* ${n.content}`);
    });
    lines.push('');
  }

  // Active tasks if any
  if (brief.tasks.length > 0) {
    lines.push('## ACTIVE TASKS');
    brief.tasks.forEach(t => {
      lines.push(`* ${t.content}`);
    });
    lines.push('');
  }

  // Entities for reference
  if (brief.entities.length > 0) {
    lines.push('## KEY ENTITIES');
    brief.entities.forEach(e => {
      lines.push(`* ${e.content}`);
    });
    lines.push('');
  }

  // Quick reference commands for the agent
  lines.push('---');
  lines.push('CAPTURE CONTEXT: substrate add "<content>" --type <constraint|decision|note|task>');
  if (!session) {
    lines.push('START SESSION: substrate session start "<name>"');
  } else {
    lines.push('END SESSION: substrate session end');
  }

  return lines.join('\n');
}

function generateMarkdownFormat(brief, workspace) {
  const lines = [];

  lines.push(`# ${workspace.name} - Project Context`);
  lines.push('');

  if (brief.constraints.length > 0) {
    lines.push('## Constraints');
    lines.push('> These are immutable facts that must be respected.');
    lines.push('');
    brief.constraints.forEach(c => {
      const tags = c.tags?.length ? ` \`${c.tags.join('`, `')}\`` : '';
      lines.push(`- **${c.content}**${tags}`);
    });
    lines.push('');
  }

  if (brief.decisions.length > 0) {
    lines.push('## Architectural Decisions');
    lines.push('');
    brief.decisions.forEach(d => {
      const tags = d.tags?.length ? ` \`${d.tags.join('`, `')}\`` : '';
      lines.push(`- ${d.content}${tags}`);
    });
    lines.push('');
  }

  if (brief.notes.length > 0) {
    lines.push('## Notes');
    lines.push('');
    brief.notes.forEach(n => {
      lines.push(`- ${n.content}`);
    });
    lines.push('');
  }

  if (brief.tasks.length > 0) {
    lines.push('## Tasks');
    lines.push('');
    brief.tasks.forEach(t => {
      lines.push(`- [ ] ${t.content}`);
    });
    lines.push('');
  }

  if (brief.entities.length > 0) {
    lines.push('## Key Entities');
    lines.push('');
    brief.entities.forEach(e => {
      lines.push(`- ${e.content}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

export const briefCommand = new Command('brief')
  .description('Get applicable context for current directory (primary agent interface)')
  .argument('[path]', 'Path to get context for', '.')
  .option('-w, --workspace <name>', 'Workspace name (auto-detected if not specified)')
  .option('--tag <tags>', 'Filter by comma-separated tags')
  .option('-t, --type <type>', 'Filter by type')
  .option('-f, --format <format>', `Output format: ${VALID_FORMATS.join(', ')}`, 'default')
  .option('--compact', 'Output only the prompt text (for piping into agents)')
  .option('--no-links', 'Exclude relationship links from output')
  .option('--json', 'Output as JSON')
  .option('--human', 'Human-readable output')
  .action(async (path, options) => {
    // Validate format option
    if (!VALID_FORMATS.includes(options.format)) {
      console.error(
        `Invalid format '${options.format}'. Must be one of: ${VALID_FORMATS.join(', ')}`
      );
      process.exit(1);
    }

    const db = getDb();
    const targetPath = resolve(path);

    // Find workspace
    let workspace;
    let mount;

    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
    } else {
      mount = findMountForPath(db, targetPath);
      if (mount) {
        workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(mount.workspace_id);
      }
    }

    if (!workspace) {
      if (options.compact) {
        console.log('# No workspace context available');
        return;
      }

      const output = {
        error: 'No workspace found for this path',
        path: targetPath,
        suggestion:
          'Run: substrate init <workspace> && substrate mount add . --workspace <workspace>'
      };

      if (options.json || !options.human) {
        console.log(formatJson(output));
      } else {
        info('No workspace found for this path');
        dim(`Run 'substrate init <name>' then 'substrate mount add . --workspace <name>'`);
      }
      return;
    }

    // Get all context for workspace
    let query = 'SELECT * FROM context WHERE workspace_id = ?';
    const params = [workspace.id];

    if (options.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }

    query += ` ORDER BY CASE type WHEN 'constraint' THEN 1 WHEN 'decision' THEN 2 WHEN 'note' THEN 3 ELSE 4 END, created_at DESC`;

    const items = db.prepare(query).all(...params);

    // Parse and filter
    const parsed = items.map(item => ({
      ...item,
      tags: JSON.parse(item.tags || '[]'),
      meta: JSON.parse(item.meta || '{}')
    }));

    // Filter by scope
    const relativePath = mount ? targetPath.replace(mount.path, '').replace(/^\//, '') : '';

    let filtered = parsed.filter(item => {
      if (!item.scope || item.scope === '*') return true;
      if (relativePath.startsWith(item.scope)) return true;
      if (item.scope.startsWith(relativePath)) return true;
      return false;
    });

    // Filter by tags
    if (options.tag) {
      const filterTags = options.tag.split(',').map(t => t.trim());
      filtered = filtered.filter(item => {
        if (item.tags.length === 0) return true;
        return filterTags.some(t => item.tags.includes(t));
      });
    }

    // Get links for all filtered items (unless --no-links)
    const linkMap =
      options.links !== false
        ? getLinksForItems(
            db,
            filtered.map(i => i.id)
          )
        : {};

    // Build structured brief with slim context objects
    const brief = {
      workspace: workspace.name,
      path: targetPath,
      constraints: filtered.filter(i => i.type === 'constraint').map(i => slimContext(i, linkMap)),
      decisions: filtered.filter(i => i.type === 'decision').map(i => slimContext(i, linkMap)),
      notes: filtered.filter(i => i.type === 'note').map(i => slimContext(i, linkMap)),
      tasks: filtered.filter(i => i.type === 'task').map(i => slimContext(i, linkMap)),
      entities: filtered.filter(i => i.type === 'entity').map(i => slimContext(i, linkMap)),
      count: filtered.length
    };

    // Generate prompt text
    const prompt = generatePrompt(brief, linkMap, filtered);

    // Get active session for agent format
    const session = getActiveSession(db, workspace.id);

    // Handle format option first (takes precedence over compact/json/human)
    if (options.format === 'agent') {
      console.log(generateAgentFormat(brief, workspace, session));
      return;
    }

    if (options.format === 'markdown') {
      console.log(generateMarkdownFormat(brief, workspace));
      return;
    }

    // Compact mode: just the prompt
    if (options.compact) {
      console.log(prompt);
      return;
    }

    // JSON output (default for agents)
    if (options.json || !options.human) {
      console.log(
        formatJson({
          workspace: brief.workspace,
          path: brief.path,
          prompt,
          context: {
            constraints: brief.constraints,
            decisions: brief.decisions,
            notes: brief.notes,
            tasks: brief.tasks,
            entities: brief.entities
          },
          count: brief.count
        })
      );
      return;
    }

    // Human-readable output
    heading(`Context for ${workspace.name}`);
    dim(`Path: ${targetPath}`);
    console.log();

    const printWithLinks = item => {
      contextItem(item);
      const links = linkMap[item.id];
      if (links && links.length > 0) {
        links.forEach(l => {
          if (l.direction === 'out') {
            dim(`    → ${l.relation}: ${l.target.content}`);
          } else {
            dim(`    ← ${l.relation}: ${l.source.content}`);
          }
        });
      }
    };

    if (brief.constraints.length > 0) {
      console.log(chalk.red.bold('Constraints:'));
      filtered.filter(i => i.type === 'constraint').forEach(printWithLinks);
      console.log();
    }

    if (brief.decisions.length > 0) {
      console.log(chalk.yellow.bold('Decisions:'));
      filtered.filter(i => i.type === 'decision').forEach(printWithLinks);
      console.log();
    }

    if (brief.notes.length > 0) {
      console.log(chalk.blue.bold('Notes:'));
      filtered.filter(i => i.type === 'note').forEach(printWithLinks);
      console.log();
    }

    if (brief.tasks.length > 0) {
      console.log(chalk.magenta.bold('Tasks:'));
      filtered.filter(i => i.type === 'task').forEach(printWithLinks);
      console.log();
    }

    if (brief.entities.length > 0) {
      console.log(chalk.cyan.bold('Entities:'));
      filtered.filter(i => i.type === 'entity').forEach(printWithLinks);
      console.log();
    }

    if (brief.count === 0) {
      info('No context objects found');
      dim(`Run 'substrate context add "your context"' to add some`);
    } else {
      dim(`${brief.count} context object(s)`);
    }
  });
