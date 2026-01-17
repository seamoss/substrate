import { Command } from 'commander';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { error, info, dim, formatJson } from '../lib/output.js';

const EXTRACTION_PROMPTS = [
  {
    type: 'constraint',
    question: 'What hard rules or invariants were discovered?',
    examples: [
      'API rate limits',
      'Data validation rules',
      'Security requirements',
      'Performance thresholds'
    ]
  },
  {
    type: 'decision',
    question: 'What architectural or design decisions were made?',
    examples: [
      'Technology choices',
      'Pattern selections',
      'Trade-off resolutions',
      'API design choices'
    ]
  },
  {
    type: 'note',
    question: 'What important context should be preserved?',
    examples: [
      'Why something works a certain way',
      'Edge cases discovered',
      'Dependencies between components',
      'Gotchas or pitfalls'
    ]
  },
  {
    type: 'entity',
    question: 'What key domain concepts were introduced?',
    examples: ['New data models', 'Service names', 'Business concepts', 'API resources']
  }
];

// File type to context type mapping
const FILE_TYPE_HINTS = {
  // Config changes often indicate decisions or constraints
  config: ['decision', 'constraint'],
  // Test files indicate behavior or constraints
  test: ['constraint', 'note'],
  // Schema files indicate entities and constraints
  schema: ['entity', 'constraint'],
  // Documentation indicates notes
  docs: ['note'],
  // API files indicate decisions and entities
  api: ['decision', 'entity'],
  // Migration files indicate decisions
  migration: ['decision', 'note']
};

// Pattern matchers for file categorization (order matters - more specific patterns first)
const FILE_PATTERNS = {
  migration: /migrations?\//i,
  config: /\.(json|ya?ml|toml|ini|env|config\.[jt]s)$/i,
  test: /\.(test|spec)\.[jt]sx?$|__tests__/i,
  schema: /(schemas?|models?)\/|\.prisma$|\.graphql$/i,
  docs: /\.(md|rst|txt)$|docs?\//i,
  api: /(routes?|api|endpoints?|controllers?)\//i
};

function categorizeFile(filepath) {
  for (const [category, pattern] of Object.entries(FILE_PATTERNS)) {
    if (pattern.test(filepath)) {
      return category;
    }
  }
  return null;
}

function getGitDiff(options = {}) {
  const { staged = false, commit = null } = options;

  try {
    let cmd;
    if (commit) {
      cmd = `git show --stat --name-status ${commit}`;
    } else if (staged) {
      cmd = 'git diff --cached --stat --name-status';
    } else {
      cmd = 'git diff --stat --name-status';
    }

    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return output;
  } catch (err) {
    return null;
  }
}

function getGitLog(limit = 5) {
  try {
    const output = execSync(`git log --oneline -n ${limit}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [hash, ...messageParts] = line.split(' ');
        return { hash, message: messageParts.join(' ') };
      });
  } catch (err) {
    return [];
  }
}

function parseGitDiff(diffOutput) {
  const lines = diffOutput.trim().split('\n');
  const files = { added: [], modified: [], deleted: [] };
  const stats = { insertions: 0, deletions: 0, filesChanged: 0 };

  for (const line of lines) {
    // Parse file status lines (A/M/D prefix)
    const statusMatch = line.match(/^([AMD])\t(.+)$/);
    if (statusMatch) {
      const [, status, filepath] = statusMatch;
      if (status === 'A') files.added.push(filepath);
      else if (status === 'M') files.modified.push(filepath);
      else if (status === 'D') files.deleted.push(filepath);
    }

    // Parse stat summary line (e.g., "3 files changed, 25 insertions(+), 10 deletions(-)")
    const statMatch = line.match(
      /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/
    );
    if (statMatch) {
      stats.filesChanged = parseInt(statMatch[1]) || 0;
      stats.insertions = parseInt(statMatch[2]) || 0;
      stats.deletions = parseInt(statMatch[3]) || 0;
    }
  }

  return { files, stats };
}

function generateSuggestions(parsedDiff) {
  const suggestions = [];
  const allFiles = [...parsedDiff.files.added, ...parsedDiff.files.modified];

  // Categorize files and collect hints
  const categoryHints = {};
  for (const file of allFiles) {
    const category = categorizeFile(file);
    if (category) {
      if (!categoryHints[category]) {
        categoryHints[category] = [];
      }
      categoryHints[category].push(file);
    }
  }

  // Generate suggestions based on categories
  for (const [category, files] of Object.entries(categoryHints)) {
    const types = FILE_TYPE_HINTS[category] || ['note'];
    const primaryType = types[0];

    if (category === 'config') {
      suggestions.push({
        type: primaryType,
        hint: `Configuration changed in: ${files.join(', ')}`,
        question: 'What configuration decisions were made and why?',
        command: `substrate add "..." --type ${primaryType} --tag config`
      });
    } else if (category === 'test') {
      suggestions.push({
        type: primaryType,
        hint: `Tests modified: ${files.join(', ')}`,
        question: 'What behaviors or constraints do these tests enforce?',
        command: `substrate add "..." --type ${primaryType} --tag testing`
      });
    } else if (category === 'schema') {
      suggestions.push({
        type: 'entity',
        hint: `Schema/models changed: ${files.join(', ')}`,
        question: 'What data models or entities were added/modified?',
        command: `substrate add "..." --type entity --tag data-model`
      });
    } else if (category === 'api') {
      suggestions.push({
        type: primaryType,
        hint: `API files changed: ${files.join(', ')}`,
        question: 'What API design decisions were made?',
        command: `substrate add "..." --type ${primaryType} --tag api`
      });
    } else if (category === 'migration') {
      suggestions.push({
        type: primaryType,
        hint: `Migrations changed: ${files.join(', ')}`,
        question: 'What database changes were made and why?',
        command: `substrate add "..." --type ${primaryType} --tag database`
      });
    }
  }

  // Add general suggestions based on change size
  if (parsedDiff.stats.filesChanged > 5) {
    suggestions.push({
      type: 'decision',
      hint: `Large change: ${parsedDiff.stats.filesChanged} files`,
      question: 'What was the overall approach or pattern used?',
      command: 'substrate add "..." --type decision'
    });
  }

  if (parsedDiff.files.added.length > 0) {
    suggestions.push({
      type: 'note',
      hint: `New files: ${parsedDiff.files.added.slice(0, 3).join(', ')}${parsedDiff.files.added.length > 3 ? '...' : ''}`,
      question: 'What do these new files do and why were they needed?',
      command: 'substrate add "..." --type note'
    });
  }

  return suggestions;
}

export const extractCommand = new Command('extract').description(
  'Extract context suggestions from work or show extraction checklist'
);

// Default action: show checklist
extractCommand
  .command('checklist', { isDefault: true })
  .description('Show extraction checklist for capturing context')
  .option('--json', 'Output as JSON')
  .action(options => {
    if (options.json) {
      console.log(formatJson({ prompts: EXTRACTION_PROMPTS }));
      return;
    }

    console.log(chalk.bold('\nContext Extraction Checklist\n'));
    console.log(chalk.dim('Review your work and capture relevant context:\n'));

    EXTRACTION_PROMPTS.forEach(prompt => {
      console.log(chalk.cyan.bold(`[${prompt.type}]`), prompt.question);
      console.log(chalk.dim(`  Examples: ${prompt.examples.join(', ')}`));
      console.log(chalk.dim(`  Command:  substrate add "..." --type ${prompt.type}\n`));
    });

    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.dim('\nTip: Use --tag to categorize (e.g., --tag auth,security)'));
    console.log(chalk.dim('Tip: Use substrate link to connect related items\n'));
  });

// extract diff - analyze working changes
extractCommand
  .command('diff')
  .description('Analyze git diff and suggest context to extract')
  .option('--staged', 'Analyze staged changes only')
  .option('--json', 'Output as JSON')
  .action(options => {
    const diffOutput = getGitDiff({ staged: options.staged });

    if (!diffOutput || diffOutput.trim() === '') {
      if (options.json) {
        console.log(formatJson({ error: 'No changes found' }));
      } else {
        info(options.staged ? 'No staged changes' : 'No uncommitted changes');
        dim('Make some changes and try again, or use "extract commit <hash>"');
      }
      return;
    }

    const parsed = parseGitDiff(diffOutput);
    const suggestions = generateSuggestions(parsed);

    if (options.json) {
      console.log(formatJson({ changes: parsed, suggestions }));
      return;
    }

    console.log(chalk.bold('\nChanges Summary\n'));

    if (parsed.files.added.length > 0) {
      console.log(chalk.green(`  + ${parsed.files.added.length} added`));
    }
    if (parsed.files.modified.length > 0) {
      console.log(chalk.yellow(`  ~ ${parsed.files.modified.length} modified`));
    }
    if (parsed.files.deleted.length > 0) {
      console.log(chalk.red(`  - ${parsed.files.deleted.length} deleted`));
    }

    if (parsed.stats.filesChanged > 0) {
      console.log(
        chalk.dim(`\n  ${parsed.stats.insertions} insertions, ${parsed.stats.deletions} deletions`)
      );
    }

    if (suggestions.length > 0) {
      console.log(chalk.bold('\n\nSuggested Context to Extract\n'));

      suggestions.forEach((s, i) => {
        console.log(chalk.cyan.bold(`${i + 1}. [${s.type}]`), s.question);
        dim(`   ${s.hint}`);
        dim(`   ${s.command}\n`);
      });
    } else {
      console.log(chalk.dim('\nNo specific suggestions. Consider the general checklist:'));
      dim('  substrate extract checklist');
    }
  });

// extract commit - analyze a specific commit
extractCommand
  .command('commit [hash]')
  .description('Analyze a commit and suggest context to extract')
  .option('--json', 'Output as JSON')
  .action((hash, options) => {
    const commits = getGitLog(5);

    if (!hash) {
      // Show recent commits to choose from
      if (options.json) {
        console.log(formatJson({ commits }));
        return;
      }

      if (commits.length === 0) {
        info('No commits found');
        return;
      }

      console.log(chalk.bold('\nRecent Commits\n'));
      commits.forEach(c => {
        console.log(`  ${chalk.yellow(c.hash)} ${c.message}`);
      });
      console.log(chalk.dim('\nUsage: substrate extract commit <hash>'));
      return;
    }

    const diffOutput = getGitDiff({ commit: hash });

    if (!diffOutput) {
      if (options.json) {
        console.log(formatJson({ error: 'Commit not found or no changes' }));
      } else {
        error(`Could not find commit: ${hash}`);
      }
      return;
    }

    const parsed = parseGitDiff(diffOutput);
    const suggestions = generateSuggestions(parsed);

    if (options.json) {
      console.log(formatJson({ commit: hash, changes: parsed, suggestions }));
      return;
    }

    console.log(chalk.bold(`\nCommit ${hash}\n`));

    if (parsed.files.added.length > 0) {
      console.log(chalk.green(`  + ${parsed.files.added.length} added`));
    }
    if (parsed.files.modified.length > 0) {
      console.log(chalk.yellow(`  ~ ${parsed.files.modified.length} modified`));
    }
    if (parsed.files.deleted.length > 0) {
      console.log(chalk.red(`  - ${parsed.files.deleted.length} deleted`));
    }

    if (suggestions.length > 0) {
      console.log(chalk.bold('\n\nSuggested Context to Extract\n'));

      suggestions.forEach((s, i) => {
        console.log(chalk.cyan.bold(`${i + 1}. [${s.type}]`), s.question);
        dim(`   ${s.hint}`);
        dim(`   ${s.command}\n`);
      });
    } else {
      console.log(chalk.dim('\nNo specific suggestions. Consider the general checklist:'));
      dim('  substrate extract checklist');
    }
  });
