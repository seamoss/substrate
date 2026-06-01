#!/usr/bin/env node

import { program } from '../src/index.js';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Audit logging - track all CLI invocations. Both logs are personal/machine-local
// and never committed:
//   1. Global: ~/.substrate/log (always; lives in home dir, outside any repo)
//   2. Local:  $CWD/.substrate/audit.priv.jsonl (if .substrate exists) -- the
//      `*.priv.jsonl` name keeps it out of git, since .substrate/ itself is committed.
function auditLog() {
  const timestamp = new Date().toISOString();
  const args = process.argv.slice(2).join(' ') || '(no args)';

  // Global log (always)
  try {
    const globalDir = join(homedir(), '.substrate');
    const globalLogPath = join(globalDir, 'log');
    if (!existsSync(globalDir)) {
      mkdirSync(globalDir, { recursive: true });
    }
    appendFileSync(globalLogPath, `${timestamp}\t${args}\n`);
  } catch (err) {
    // Silently fail
  }

  // Local log (only if .substrate dir already exists - don't create it).
  // JSONL with a .priv.jsonl name so it is gitignored, not committed with the dir.
  try {
    const localDir = join(process.cwd(), '.substrate');
    if (existsSync(localDir)) {
      appendFileSync(
        join(localDir, 'audit.priv.jsonl'),
        JSON.stringify({ ts: timestamp, args }) + '\n'
      );
    }
  } catch (err) {
    // Silently fail
  }
}

auditLog();
program.parse();
