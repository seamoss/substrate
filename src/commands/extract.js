import { Command } from 'commander';
import chalk from 'chalk';

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
    examples: [
      'New data models',
      'Service names',
      'Business concepts',
      'API resources'
    ]
  }
];

export const extractCommand = new Command('extract')
  .description('Show extraction checklist for capturing context after completing work')
  .option('--json', 'Output as JSON')
  .action((options) => {
    if (options.json) {
      console.log(JSON.stringify({ prompts: EXTRACTION_PROMPTS }, null, 2));
      return;
    }

    console.log(chalk.bold('\n📋 Context Extraction Checklist\n'));
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
