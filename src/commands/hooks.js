import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, unlinkSync } from 'fs';
import { join } from 'path';
import { gitHooksDir } from '../lib/git.js';
import { success, error, info, dim } from '../lib/output.js';

const BEGIN = '# >>> substrate post-commit (managed) >>>';
const END = '# <<< substrate post-commit (managed) <<<';

// After each commit, surface context worth capturing. Guarded so it's a no-op
// when substrate isn't installed or the repo isn't tracked, and never fails the commit.
const BLOCK = `${BEGIN}
if command -v substrate >/dev/null 2>&1 && [ -d "$(git rev-parse --show-toplevel)/.substrate" ]; then
  substrate extract commit HEAD 2>/dev/null || true
fi
${END}`;

/** Whether a hook file already contains our managed block. */
export function hasManagedBlock(content) {
  return Boolean(content) && content.includes(BEGIN);
}

/** Return hook content with our managed block added (idempotent). */
export function addManagedBlock(content) {
  if (!content || !content.trim()) return `#!/bin/sh\n\n${BLOCK}\n`;
  if (hasManagedBlock(content)) return content;
  return content.replace(/\n*$/, '\n') + `\n${BLOCK}\n`;
}

/** Return hook content with our managed block removed. */
export function removeManagedBlock(content) {
  if (!content) return content;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\n*${esc(BEGIN)}[\\s\\S]*?${esc(END)}\\n*`);
  return content.replace(re, '\n');
}

export const hooksCommand = new Command('hooks').description('Manage Substrate git hooks');

hooksCommand
  .command('install')
  .description('Install a post-commit hook that suggests context to capture')
  .action(() => {
    const dir = gitHooksDir();
    if (!dir) {
      error('Not a git repository');
      process.exit(1);
    }
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'post-commit');
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';

    if (hasManagedBlock(existing)) {
      info('Substrate post-commit hook already installed');
      return;
    }

    writeFileSync(path, addManagedBlock(existing));
    chmodSync(path, 0o755);
    success('Installed post-commit hook');
    dim('  After each commit, Substrate suggests context worth capturing.');
    dim('  Remove it with: substrate hooks uninstall');
  });

hooksCommand
  .command('uninstall')
  .description('Remove the Substrate post-commit hook')
  .action(() => {
    const dir = gitHooksDir();
    if (!dir) {
      error('Not a git repository');
      process.exit(1);
    }
    const path = join(dir, 'post-commit');
    const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (!hasManagedBlock(content)) {
      info('Substrate post-commit hook is not installed');
      return;
    }
    const stripped = removeManagedBlock(content);
    // If nothing but a shebang remains, drop the file entirely.
    if (!stripped.trim() || stripped.trim() === '#!/bin/sh') {
      unlinkSync(path);
    } else {
      writeFileSync(path, stripped);
    }
    success('Removed Substrate post-commit hook');
  });

hooksCommand
  .command('status', { isDefault: true })
  .description('Show whether Substrate git hooks are installed')
  .action(() => {
    const dir = gitHooksDir();
    if (!dir) {
      error('Not a git repository');
      process.exit(1);
    }
    const path = join(dir, 'post-commit');
    const installed = existsSync(path) && hasManagedBlock(readFileSync(path, 'utf8'));
    if (installed) {
      success('post-commit hook: installed');
    } else {
      info('post-commit hook: not installed');
      dim('  Install with: substrate hooks install');
    }
  });
