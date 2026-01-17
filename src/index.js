import { Command } from 'commander';
import { mountCommand } from './commands/mount.js';
import { contextCommand } from './commands/context.js';
import { briefCommand } from './commands/brief.js';
import { initCommand } from './commands/init.js';
import { linkCommand } from './commands/link.js';
import { extractCommand } from './commands/extract.js';
import { digestCommand, recallCommand } from './commands/history.js';
import { addCommand, lsCommand, statusCommand } from './commands/shorthands.js';
import { configCommand } from './commands/config.js';
import { mcpCommand } from './commands/mcp.js';
import { projectCommand } from './commands/project.js';
import { syncCommand } from './commands/sync.js';
import { relatedCommand } from './commands/related.js';
import { dumpCommand } from './commands/dump.js';
import { authCommand } from './commands/auth.js';
import { sessionCommand } from './commands/session.js';

export const program = new Command();

program
  .name('substrate')
  .description('Substrate - Shared context layer for humans and agents')
  .version('0.1.0');

// Core commands
program.addCommand(initCommand);
program.addCommand(mountCommand);
program.addCommand(contextCommand);
program.addCommand(briefCommand);
program.addCommand(linkCommand);
program.addCommand(extractCommand);
program.addCommand(digestCommand);
program.addCommand(recallCommand);

// Shorthands for common operations
program.addCommand(addCommand); // substrate add = substrate context add
program.addCommand(lsCommand); // substrate ls = substrate context list
program.addCommand(statusCommand); // substrate status = substrate mount status

// Configuration and MCP
program.addCommand(configCommand); // substrate config
program.addCommand(mcpCommand); // substrate mcp serve
program.addCommand(projectCommand); // substrate project id/info/pin/unpin

// Sync
program.addCommand(syncCommand); // substrate sync push/pull/status

// Graph exploration
program.addCommand(relatedCommand); // substrate related <id>

// Export
program.addCommand(dumpCommand); // substrate dump

// Auth
program.addCommand(authCommand); // substrate auth signup/verify/login/logout/keys/token

// Sessions
program.addCommand(sessionCommand); // substrate session start/end/status/list

// Default action: show help
program.action(async () => {
  program.help();
});
