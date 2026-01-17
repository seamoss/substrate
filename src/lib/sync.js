import { getDb } from '../db/local.js';
import { api } from './api.js';

/**
 * Get sync status for a workspace
 */
export async function getSyncStatus(workspaceId) {
  const db = getDb();

  // Check API connectivity
  let online = false;
  try {
    const health = await api.health();
    online = !health.offline;
  } catch {
    online = false;
  }

  // Get workspace
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    return { error: 'Workspace not found' };
  }

  // Count items needing push (never synced or modified since last sync)
  const pendingPush = db.prepare(`
    SELECT COUNT(*) as count FROM context
    WHERE workspace_id = ? AND deleted_at IS NULL
    AND (synced_at IS NULL OR updated_at > synced_at)
  `).get(workspaceId);

  // Count links needing push
  const pendingLinksPush = db.prepare(`
    SELECT COUNT(*) as count FROM links l
    JOIN context c ON l.from_id = c.id
    WHERE c.workspace_id = ?
    AND l.created_at > COALESCE(c.synced_at, '1970-01-01')
  `).get(workspaceId);

  // Get last sync time
  const lastSync = db.prepare(`
    SELECT MAX(synced_at) as last FROM context WHERE workspace_id = ?
  `).get(workspaceId);

  return {
    workspace: workspace.name,
    workspaceId,
    online,
    lastSync: lastSync?.last || null,
    pending: {
      push: {
        context: pendingPush.count,
        links: pendingLinksPush.count
      }
    }
  };
}

/**
 * Push local changes to remote
 */
export async function pushChanges(workspaceId, options = {}) {
  const db = getDb();
  const { verbose } = options;

  // Get workspace
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    return { error: 'Workspace not found' };
  }

  // Ensure workspace exists on remote
  let remoteWorkspaceId;
  if (!workspace.remote_id) {
    try {
      const created = await api.createWorkspace(workspace.name, workspace.description);
      // Extract just the ID part from 'workspace:xyz' format
      remoteWorkspaceId = created.id.replace('workspace:', '');
      db.prepare('UPDATE workspaces SET remote_id = ?, synced_at = ? WHERE id = ?')
        .run(remoteWorkspaceId, new Date().toISOString(), workspaceId);
    } catch (err) {
      return { error: `Failed to create remote workspace: ${err.message}` };
    }
  } else {
    // Strip prefix if stored with it
    remoteWorkspaceId = workspace.remote_id.replace('workspace:', '');
  }

  // Get items needing push
  const items = db.prepare(`
    SELECT * FROM context
    WHERE workspace_id = ? AND deleted_at IS NULL
    AND (synced_at IS NULL OR updated_at > synced_at)
    ORDER BY created_at ASC
  `).all(workspaceId);

  const results = { pushed: 0, failed: 0, errors: [] };

  for (const item of items) {
    try {
      // Push to remote via batch endpoint
      const response = await api.syncPush(remoteWorkspaceId, [{
        id: item.id,
        type: item.type,
        content: item.content,
        tags: JSON.parse(item.tags || '[]'),
        scope: item.scope,
        meta: JSON.parse(item.meta || '{}'),
        created_at: item.created_at,
        updated_at: item.updated_at
      }]);

      if (response.error) {
        results.failed++;
        results.errors.push({ id: item.id, error: response.error });
        continue;
      }

      // Update local sync status
      const now = new Date().toISOString();
      const remoteId = response.items?.[0]?.id || item.id;
      db.prepare('UPDATE context SET remote_id = ?, synced_at = ? WHERE id = ?')
        .run(remoteId, now, item.id);

      results.pushed++;
      if (verbose) {
        console.log(`  Pushed: ${item.content.substring(0, 50)}...`);
      }
    } catch (err) {
      results.failed++;
      results.errors.push({ id: item.id, error: err.message });
    }
  }

  // Push links
  const links = db.prepare(`
    SELECT l.* FROM links l
    JOIN context c ON l.from_id = c.id
    WHERE c.workspace_id = ?
    AND l.created_at > COALESCE(c.synced_at, '1970-01-01')
  `).all(workspaceId);

  for (const link of links) {
    try {
      await api.linkContext(remoteWorkspaceId, link.from_id, link.to_id, link.relation);
    } catch (err) {
      // Links may already exist, ignore errors
    }
  }

  return results;
}

/**
 * Pull remote changes to local
 */
export async function pullChanges(workspaceId, options = {}) {
  const db = getDb();
  const { verbose } = options;

  // Get workspace
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    return { error: 'Workspace not found' };
  }

  if (!workspace.remote_id) {
    return { error: 'Workspace not synced to remote yet. Run push first.' };
  }

  // Strip prefix if stored with it
  const remoteWorkspaceId = workspace.remote_id.replace('workspace:', '');

  // Get last sync time for incremental pull
  const lastSync = db.prepare(`
    SELECT MAX(synced_at) as last FROM context WHERE workspace_id = ?
  `).get(workspaceId);

  // Fetch remote changes
  let remoteItems;
  try {
    remoteItems = await api.syncPull(remoteWorkspaceId, lastSync?.last);
  } catch (err) {
    return { error: `Failed to fetch remote changes: ${err.message}` };
  }

  if (remoteItems.error) {
    return { error: remoteItems.error };
  }

  const results = { pulled: 0, updated: 0, skipped: 0 };
  const now = new Date().toISOString();

  for (const remote of remoteItems.items || []) {
    // Check if exists locally
    const local = db.prepare('SELECT * FROM context WHERE id = ? OR remote_id = ?')
      .get(remote.id, remote.id);

    if (!local) {
      // New item - insert
      db.prepare(`
        INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, remote_id, created_at, updated_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        remote.id,
        workspaceId,
        remote.type,
        remote.content,
        JSON.stringify(remote.tags || []),
        remote.scope || '*',
        JSON.stringify(remote.meta || {}),
        remote.id,
        remote.created_at,
        remote.updated_at,
        now
      );
      results.pulled++;
      if (verbose) {
        console.log(`  Pulled: ${remote.content.substring(0, 50)}...`);
      }
    } else {
      // Exists - check if remote is newer (last-write-wins)
      const remoteTime = new Date(remote.updated_at).getTime();
      const localTime = new Date(local.updated_at).getTime();

      if (remoteTime > localTime) {
        // Remote is newer - update local
        db.prepare(`
          UPDATE context SET type = ?, content = ?, tags = ?, scope = ?, meta = ?, updated_at = ?, synced_at = ?
          WHERE id = ?
        `).run(
          remote.type,
          remote.content,
          JSON.stringify(remote.tags || []),
          remote.scope || '*',
          JSON.stringify(remote.meta || {}),
          remote.updated_at,
          now,
          local.id
        );
        results.updated++;
        if (verbose) {
          console.log(`  Updated: ${remote.content.substring(0, 50)}...`);
        }
      } else {
        results.skipped++;
      }
    }
  }

  return results;
}

/**
 * Bidirectional sync (push then pull)
 */
export async function syncWorkspace(workspaceId, options = {}) {
  const pushResult = await pushChanges(workspaceId, options);
  if (pushResult.error) {
    return { push: pushResult, pull: null };
  }

  const pullResult = await pullChanges(workspaceId, options);

  return {
    push: pushResult,
    pull: pullResult
  };
}
