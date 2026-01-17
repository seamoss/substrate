import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { getConfigPath, ensureConfigDir } from '../lib/config.js';
import { success, error, info, formatJson, dim } from '../lib/output.js';
import chalk from 'chalk';

const VALID_STRATEGIES = ['instructions', 'mcp'];

function loadConfig() {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return { strategy: 'instructions' }; // Default
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return { strategy: 'instructions' };
  }
}

function saveConfig(config) {
  ensureConfigDir();
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function getStrategy() {
  return loadConfig().strategy || 'instructions';
}

export const configCommand = new Command('config')
  .description('Manage Substrate configuration');

// config show
configCommand
  .command('show')
  .description('Show current configuration')
  .option('--json', 'Output as JSON')
  .action((options) => {
    const config = loadConfig();

    if (options.json) {
      console.log(formatJson(config));
      return;
    }

    console.log();
    console.log(chalk.bold('Substrate Configuration'));
    console.log();
    console.log(`  Strategy: ${chalk.cyan(config.strategy || 'instructions')}`);
    console.log();

    if (config.strategy === 'instructions') {
      dim('  Mode: Agent reads CLAUDE.md and follows protocol');
      dim('  Agent must manually run substrate commands');
    } else if (config.strategy === 'mcp') {
      dim('  Mode: MCP server provides native tools');
      dim('  Agent uses tools directly without shell commands');
    }
    console.log();
  });

// config strategy
configCommand
  .command('strategy')
  .description('Set agent integration strategy')
  .argument('<mode>', `Strategy mode: ${VALID_STRATEGIES.join(' | ')}`)
  .action((mode) => {
    if (!VALID_STRATEGIES.includes(mode)) {
      error(`Invalid strategy '${mode}'. Must be: ${VALID_STRATEGIES.join(' or ')}`);
      process.exit(1);
    }

    const config = loadConfig();
    const oldStrategy = config.strategy || 'instructions';
    config.strategy = mode;
    saveConfig(config);

    success(`Strategy set to '${mode}'`);
    console.log();

    if (mode === 'instructions') {
      info('Agent will read CLAUDE.md and follow the Agent Protocol');
      dim('  Ensure CLAUDE.md contains the Agent Protocol section');
      dim('  Agent runs substrate commands via shell');
    } else if (mode === 'mcp') {
      info('Agent will use MCP server tools directly');
      dim('  Start MCP server: substrate mcp serve');
      dim('  Configure Claude Code to use the MCP server');
      console.log();
      if (oldStrategy === 'instructions') {
        info('Tip: You may want to remove/hide the Agent Protocol from CLAUDE.md');
        info('     to avoid conflicting instructions');
      }
    }
  });

// config get
configCommand
  .command('get')
  .description('Get a specific config value')
  .argument('<key>', 'Config key to get')
  .action((key) => {
    const config = loadConfig();
    if (key in config) {
      console.log(config[key]);
    } else {
      error(`Unknown config key: ${key}`);
      process.exit(1);
    }
  });

// config set
configCommand
  .command('set')
  .description('Set a config value')
  .argument('<key>', 'Config key')
  .argument('<value>', 'Config value')
  .action((key, value) => {
    const config = loadConfig();
    config[key] = value;
    saveConfig(config);
    success(`Set ${key} = ${value}`);
  });
