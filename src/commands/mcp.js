import { Command } from 'commander';
import { startMcpServer } from '../mcp/server.js';
import { getStrategy } from './config.js';
import { error, info, dim } from '../lib/output.js';

export const mcpCommand = new Command('mcp').description('MCP server for native tool integration');

mcpCommand
  .command('serve')
  .description('Start the MCP server (for Claude Code integration)')
  .action(async () => {
    const strategy = getStrategy();

    if (strategy !== 'mcp') {
      error(`Cannot start MCP server: strategy is set to '${strategy}'`);
      info('Switch to MCP mode first:');
      dim('  substrate config strategy mcp');
      process.exit(1);
    }

    try {
      await startMcpServer();
    } catch (err) {
      error(`MCP server failed: ${err.message}`);
      process.exit(1);
    }
  });

mcpCommand
  .command('status')
  .description('Check MCP configuration status')
  .action(() => {
    const strategy = getStrategy();

    console.log();
    if (strategy === 'mcp') {
      info('MCP mode is active');
      dim('  Start server: substrate mcp serve');
      dim('  Configure Claude Code to use this MCP server');
    } else {
      info(`Current strategy: ${strategy}`);
      dim('  To enable MCP: substrate config strategy mcp');
    }
    console.log();
  });
