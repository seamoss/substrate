#!/usr/bin/env node

import { program } from '../src/index.js';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Audit logging - track all CLI invocations
// Logs to both:
//   1. Global: ~/.substrate/log (always)
//   2. Local: $CWD/.substrate/log (if .substrate dir exists)
function auditLog() {
  const timestamp = new Date().toISOString();
  const args = process.argv.slice(2).join(' ') || '(no args)';
  const entry = `${timestamp}\t${args}\n`;

  // Global log (always)
  try {
    const globalDir = join(homedir(), '.substrate');
    const globalLogPath = join(globalDir, 'log');
    if (!existsSync(globalDir)) {
      mkdirSync(globalDir, { recursive: true });
    }
    appendFileSync(globalLogPath, entry);
  } catch (err) {
    // Silently fail
  }

  // Local log (only if .substrate dir already exists - don't create it)
  try {
    const cwd = process.cwd();
    const localDir = join(cwd, '.substrate');
    if (existsSync(localDir)) {
      appendFileSync(join(localDir, 'log'), entry);
    }
  } catch (err) {
    // Silently fail
  }
}

auditLog();
program.parse();
