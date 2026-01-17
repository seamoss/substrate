import { Command } from 'commander';
import { getDb } from '../db/local.js';
import { api } from '../lib/api.js';
import { success, info, formatJson } from '../lib/output.js';
import { saveProjectConfig } from '../lib/config.js';
import { randomUUID } from 'crypto';
import ora from 'ora';

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

    // Create .substrate/config.json with project_id
    saveProjectConfig({ project_id: projectId });

    // Try to sync to remote
    let remoteId = null;
    const spinner = options.json ? null : ora('Creating workspace...').start();
    try {
      const result = await api.createWorkspace(name, options.description, projectId);
      if (result.workspace?.id) {
        remoteId = result.workspace.id;
        db.prepare('UPDATE workspaces SET remote_id = ?, synced_at = ? WHERE id = ?').run(
          remoteId,
          now,
          id
        );
      }
      spinner?.stop();
    } catch (err) {
      spinner?.stop();
      // Offline is fine, will sync later
    }

    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);

    if (options.json) {
      console.log(formatJson({ workspace, created: true }));
    } else {
      success(`Created workspace '${name}'`);
      if (!remoteId) {
        info('Workspace created locally (will sync when API is available)');
      }
    }
  });
