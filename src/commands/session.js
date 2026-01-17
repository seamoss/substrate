/**
 * Session command - Manage work sessions for tracking agent activity.
 *
 * Sessions provide temporal grouping of work. When a session is active,
 * all context added is associated with that session, enabling:
 * - Activity tracking during agent work
 * - Session summaries with statistics
 * - Historical review of work done
 *
 * ## Workflow
 *
 * 1. Start a session before beginning work
 * 2. Add context as you work (automatically tracked)
 * 3. End session to get summary statistics
 *
 * @module commands/session
 *
 * @example
 * // Start a session
 * substrate session start "implementing auth"
 *
 * @example
 * // Check current session
 * substrate session status
 *
 * @example
 * // End session and get stats
 * substrate session end
 */

import { Command } from 'commander';
import { randomUUID } from 'crypto';
import { getDb } from '../db/local.js';
import { success, error, info, warn, formatJson, dim, shortId } from '../lib/output.js';
import chalk from 'chalk';

/**
 * Find workspace for the current working directory via mount lookup.
 *
 * Searches mounts in order of path length (most specific first) to find
 * the workspace that contains the current directory.
 *
 * @returns {import('../db/local.js').Workspace|null} Matching workspace or null
 * @private
 */
function findWorkspaceForCwd() {
  const db = getDb();
  const cwd = process.cwd();

  const mounts = db.prepare('SELECT * FROM mounts ORDER BY length(path) DESC').all();

  for (const mount of mounts) {
    if (cwd.startsWith(mount.path)) {
      return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(mount.workspace_id);
    }
  }

  return null;
}

/**
 * Get the currently active session for a workspace.
 *
 * An active session is one where `ended_at` is NULL.
 * Only one session can be active per workspace at a time.
 *
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {string} workspaceId - Workspace UUID
 * @returns {import('../db/local.js').Session|undefined} Active session or undefined
 *
 * @example
 * const session = getActiveSession(db, workspace.id);
 * if (session) {
 *   console.log(`Session active: ${session.name}`);
 * }
 */
export function getActiveSession(db, workspaceId) {
  return db
    .prepare(
      'SELECT * FROM sessions WHERE workspace_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
    )
    .get(workspaceId);
}

/**
 * @typedef {Object} SessionStats
 * @property {Object<string, number>} context - Count of items by type
 * @property {number} totalContext - Total context items added
 * @property {number} links - Number of links created
 */

/**
 * Get statistics for a session.
 *
 * Counts context items and links created during the session's time window.
 * For active sessions, uses current time as the end boundary.
 *
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {import('../db/local.js').Session} session - Session to get stats for
 * @returns {SessionStats} Statistics about the session
 *
 * @example
 * const stats = getSessionStats(db, session);
 * console.log(`Added ${stats.totalContext} items and ${stats.links} links`);
 */
export function getSessionStats(db, session) {
  const endTime = session.ended_at || new Date().toISOString();

  const stats = db
    .prepare(
      `
    SELECT
      type,
      COUNT(*) as count
    FROM context
    WHERE workspace_id = ?
      AND created_at >= ?
      AND created_at <= ?
      AND deleted_at IS NULL
    GROUP BY type
  `
    )
    .all(session.workspace_id, session.started_at, endTime);

  const links = db
    .prepare(
      `
    SELECT COUNT(*) as count
    FROM links l
    JOIN context c ON l.from_id = c.id
    WHERE c.workspace_id = ?
      AND l.created_at >= ?
      AND l.created_at <= ?
  `
    )
    .get(session.workspace_id, session.started_at, endTime);

  return {
    context: stats.reduce((acc, s) => {
      acc[s.type] = s.count;
      return acc;
    }, {}),
    totalContext: stats.reduce((sum, s) => sum + s.count, 0),
    links: links?.count || 0
  };
}

/**
 * Format a duration between two timestamps for display.
 *
 * @param {string} startedAt - ISO 8601 start timestamp
 * @param {string|null} endedAt - ISO 8601 end timestamp, or null for now
 * @returns {string} Human-readable duration (e.g., "2h 15m" or "45m")
 * @private
 */
function formatDuration(startedAt, endedAt) {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const diffMs = end - start;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * The session command for Commander.js.
 *
 * Provides subcommands for session management:
 * - `start [name]` - Start a new work session
 * - `end` - End the current active session
 * - `status` - Show current session status
 * - `list` / `ls` - List recent sessions
 *
 * @type {Command}
 */
export const sessionCommand = new Command('session').description(
  'Manage work sessions for tracking agent activity'
);

// session start
sessionCommand
  .command('start')
  .description('Start a new work session')
  .argument('[name]', 'Optional session name')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    const db = getDb();

    let workspace;
    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
      if (!workspace) {
        error(`Workspace '${options.workspace}' not found`);
        process.exit(1);
      }
    } else {
      workspace = findWorkspaceForCwd();
      if (!workspace) {
        error('No workspace found for current directory');
        process.exit(1);
      }
    }

    // Check for existing active session
    const active = getActiveSession(db, workspace.id);
    if (active) {
      if (options.json) {
        console.log(
          formatJson({
            error: 'Session already active',
            session: {
              id: shortId(active.id),
              name: active.name,
              started_at: active.started_at
            }
          })
        );
      } else {
        warn('A session is already active');
        console.log(`  ${shortId(active.id)} ${active.name || '(unnamed)'}`);
        info('End it with: substrate session end');
      }
      process.exit(1);
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    db.prepare(
      `
      INSERT INTO sessions (id, workspace_id, name, started_at)
      VALUES (?, ?, ?, ?)
    `
    ).run(id, workspace.id, name || null, now);

    if (options.json) {
      console.log(
        formatJson({
          session: {
            id: shortId(id),
            name: name || null,
            workspace: workspace.name,
            started_at: now
          }
        })
      );
    } else {
      success(`Session started${name ? `: ${name}` : ''}`);
      dim(`  ID: ${shortId(id)}`);
      dim(`  Workspace: ${workspace.name}`);
    }
  });

// session end
sessionCommand
  .command('end')
  .description('End the current work session')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('--json', 'Output as JSON')
  .action(async options => {
    const db = getDb();

    let workspace;
    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
      if (!workspace) {
        error(`Workspace '${options.workspace}' not found`);
        process.exit(1);
      }
    } else {
      workspace = findWorkspaceForCwd();
      if (!workspace) {
        error('No workspace found for current directory');
        process.exit(1);
      }
    }

    const active = getActiveSession(db, workspace.id);
    if (!active) {
      if (options.json) {
        console.log(formatJson({ error: 'No active session' }));
      } else {
        info('No active session to end');
      }
      process.exit(1);
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(now, active.id);

    const stats = getSessionStats(db, { ...active, ended_at: now });
    const duration = formatDuration(active.started_at, now);

    if (options.json) {
      console.log(
        formatJson({
          session: {
            id: shortId(active.id),
            name: active.name,
            started_at: active.started_at,
            ended_at: now,
            duration
          },
          stats
        })
      );
    } else {
      success(`Session ended${active.name ? `: ${active.name}` : ''}`);
      dim(`  Duration: ${duration}`);

      if (stats.totalContext > 0) {
        console.log();
        info('Context added this session:');
        Object.entries(stats.context).forEach(([type, count]) => {
          console.log(`  ${count} ${type}${count > 1 ? 's' : ''}`);
        });
        if (stats.links > 0) {
          console.log(`  ${stats.links} link${stats.links > 1 ? 's' : ''}`);
        }
      } else {
        dim('  No context added');
      }
    }
  });

// session status
sessionCommand
  .command('status')
  .description('Show current session status')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('--json', 'Output as JSON')
  .action(async options => {
    const db = getDb();

    let workspace;
    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
      if (!workspace) {
        error(`Workspace '${options.workspace}' not found`);
        process.exit(1);
      }
    } else {
      workspace = findWorkspaceForCwd();
      if (!workspace) {
        error('No workspace found for current directory');
        process.exit(1);
      }
    }

    const active = getActiveSession(db, workspace.id);

    if (options.json) {
      if (active) {
        const stats = getSessionStats(db, active);
        console.log(
          formatJson({
            active: true,
            session: {
              id: shortId(active.id),
              name: active.name,
              started_at: active.started_at,
              duration: formatDuration(active.started_at, null)
            },
            stats
          })
        );
      } else {
        console.log(formatJson({ active: false }));
      }
      return;
    }

    if (active) {
      const stats = getSessionStats(db, active);
      const duration = formatDuration(active.started_at, null);

      success(`Active session${active.name ? `: ${active.name}` : ''}`);
      dim(`  ID: ${shortId(active.id)}`);
      dim(`  Started: ${new Date(active.started_at).toLocaleString()}`);
      dim(`  Duration: ${duration}`);

      if (stats.totalContext > 0) {
        console.log();
        info('Context added so far:');
        Object.entries(stats.context).forEach(([type, count]) => {
          console.log(`  ${count} ${type}${count > 1 ? 's' : ''}`);
        });
        if (stats.links > 0) {
          console.log(`  ${stats.links} link${stats.links > 1 ? 's' : ''}`);
        }
      }
    } else {
      info('No active session');
      dim('Start one with: substrate session start [name]');
    }
  });

// session list
sessionCommand
  .command('list')
  .alias('ls')
  .description('List recent sessions')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('-n, --limit <n>', 'Number of sessions to show', '10')
  .option('--json', 'Output as JSON')
  .action(async options => {
    const db = getDb();

    let workspace;
    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
      if (!workspace) {
        error(`Workspace '${options.workspace}' not found`);
        process.exit(1);
      }
    } else {
      workspace = findWorkspaceForCwd();
      if (!workspace) {
        error('No workspace found for current directory');
        process.exit(1);
      }
    }

    const sessions = db
      .prepare(
        `
      SELECT * FROM sessions
      WHERE workspace_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `
      )
      .all(workspace.id, parseInt(options.limit));

    if (options.json) {
      const sessionsWithStats = sessions.map(s => ({
        id: shortId(s.id),
        name: s.name,
        started_at: s.started_at,
        ended_at: s.ended_at,
        active: !s.ended_at,
        duration: formatDuration(s.started_at, s.ended_at),
        stats: getSessionStats(db, s)
      }));
      console.log(formatJson({ sessions: sessionsWithStats }));
      return;
    }

    if (sessions.length === 0) {
      info('No sessions found');
      dim('Start one with: substrate session start [name]');
      return;
    }

    sessions.forEach(s => {
      const isActive = !s.ended_at;
      const duration = formatDuration(s.started_at, s.ended_at);
      const stats = getSessionStats(db, s);

      const status = isActive ? chalk.green('● active') : chalk.dim('○ ended');
      const nameStr = s.name ? s.name : chalk.dim('(unnamed)');

      console.log(`${shortId(s.id)} ${status} ${nameStr}`);
      dim(`  ${new Date(s.started_at).toLocaleString()} (${duration})`);

      if (stats.totalContext > 0) {
        const parts = Object.entries(stats.context).map(([t, c]) => `${c} ${t}`);
        if (stats.links > 0) parts.push(`${stats.links} links`);
        dim(`  ${parts.join(', ')}`);
      }
    });
  });
