import { Command } from 'commander';
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getDb } from '../db/local.js';
import { success, info, formatJson } from '../lib/output.js';
import { saveProjectConfig } from '../lib/config.js';
import { serializeWorkspace, PRIVATE_IGNORE_PATTERN } from '../lib/files.js';
import { randomUUID } from 'crypto';

/**
 * Ensure the project's .gitignore excludes the personal `*.priv.jsonl` files, so
 * private context is never committed by accident. Idempotent.
 *
 * @param {string} root - Project root directory
 * @returns {boolean} True if the rule was added
 */
function ensurePrivateIgnored(root) {
  const gitignorePath = join(root, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${PRIVATE_IGNORE_PATTERN}\n`);
    return true;
  }
  const current = readFileSync(gitignorePath, 'utf8');
  const ignored = current
    .split('\n')
    .map(l => l.trim())
    .includes(PRIVATE_IGNORE_PATTERN);
  if (ignored) return false;
  appendFileSync(gitignorePath, `${current.endsWith('\n') ? '' : '\n'}${PRIVATE_IGNORE_PATTERN}\n`);
  return true;
}

export const initCommand = new Command('init')
  .description('Initialize a new workspace')
  .argument('[name]', 'Workspace name', 'default')
  .option('-d, --description <desc>', 'Workspace description')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    const db = getDb();

    // Check if workspace exists locally
    const existing = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(name);

    if (existing) {
      if (options.json) {
        console.log(formatJson({ workspace: existing, created: false }));
      } else {
        info(`Workspace '${name}' already exists`);
      }
      return;
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const projectId = randomUUID();

    // Create locally first
    db.prepare(
      `
      INSERT INTO workspaces (id, name, description, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(id, name, options.description || '', projectId, now, now);

    // Mount the current directory so commands resolve this workspace by cwd.
    db.prepare(
      `INSERT OR IGNORE INTO mounts (workspace_id, path, scope, tags, created_at, updated_at)
       VALUES (?, ?, '*', '[]', ?, ?)`
    ).run(id, process.cwd(), now, now);

    // Create .substrate/config.json with project_id
    saveProjectConfig({ project_id: projectId });

    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);

    // Lay down the initial .substrate files so the workspace is committable.
    serializeWorkspace(db, workspace, process.cwd());

    // Keep the personal store out of version control.
    const addedIgnore = ensurePrivateIgnored(process.cwd());

    if (options.json) {
      console.log(formatJson({ workspace, created: true, gitignore_updated: addedIgnore }));
    } else {
      success(`Created workspace '${name}'`);
      info('Wrote .substrate/ files — commit them with git to share this workspace');
      if (addedIgnore) {
        info('Added *.priv.jsonl to .gitignore (personal context stays local)');
      }
    }
  });
