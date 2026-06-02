import { Command } from 'commander';
import { randomUUID } from 'crypto';
import { getDb } from '../db/local.js';
import { requireStore } from '../lib/store.js';
import { gatherCandidates } from '../lib/ingest.js';
import { checkDuplicate } from '../lib/similarity.js';
import { captureProvenance } from '../lib/git.js';
import { success, error, info, dim, formatJson } from '../lib/output.js';
import chalk from 'chalk';

const VALID_FROM = ['git', 'docs', 'all'];

function sourceLabel(source) {
  if (source.commit) return `[${source.commit}]`;
  if (source.file) return `[${source.file}]`;
  return '';
}

export const ingestCommand = new Command('ingest')
  .description("Bootstrap context from this repo's git history and docs (proposals you review)")
  .option('--from <source>', `Source: ${VALID_FROM.join(', ')}`, 'all')
  .option('--since <ref>', 'Only mine commits after this git ref/tag')
  .option('-n, --limit <n>', 'Max commits to scan', '50')
  .option('--apply', 'Add the proposed items (default is a dry run)')
  .option('--plan', 'Emit raw material + an instruction for an agent to extract semantically')
  .option('--json', 'Output as JSON')
  .action(options => {
    const db = getDb();
    const { workspace, root } = requireStore(db, error);

    if (!VALID_FROM.includes(options.from)) {
      error(`Invalid --from '${options.from}'. Use: ${VALID_FROM.join(', ')}`);
      process.exit(1);
    }

    const candidates = gatherCandidates(root, {
      from: options.from,
      since: options.since,
      limit: parseInt(options.limit) || 50
    });

    // Flag candidates that already have a near-duplicate in the store.
    const annotated = candidates.map(c => {
      const dup = checkDuplicate(db, workspace.id, c.content, c.type);
      return { ...c, duplicate: dup ? { id: dup.id, similarity: dup.similarity } : null };
    });
    const fresh = annotated.filter(c => !c.duplicate);

    // Agent-assisted: hand the raw material over for semantic extraction.
    if (options.plan) {
      const material = candidates
        .map(c => `- (${c.type}) ${c.content}  ${sourceLabel(c.source)}`.trimEnd())
        .join('\n');
      const prompt =
        'Review the candidate context below, mined from this repo. For each that is a ' +
        'durable, useful project fact, run:\n' +
        '  substrate add "<refined statement>" --type ' +
        '<constraint|decision|note|task|entity|runbook|snippet> [--tag ...]\n' +
        'Skip noise, merge duplicates, and sharpen the wording.\n\nCandidates:\n\n' +
        (material || '(none found)');
      if (options.json) console.log(formatJson({ candidates, prompt }));
      else console.log(prompt);
      return;
    }

    if (options.json && !options.apply) {
      console.log(
        formatJson({
          candidates: annotated,
          fresh: fresh.length,
          duplicates: annotated.length - fresh.length
        })
      );
      return;
    }

    if (annotated.length === 0) {
      if (options.json) console.log(formatJson({ added: 0, candidates: [] }));
      else
        info('No candidates found. Try `--since <tag>`, or capture manually with `substrate add`.');
      return;
    }

    // Dry run (default): show what would be added.
    if (!options.apply) {
      console.log();
      info(
        `Found ${annotated.length} candidate(s) — ${fresh.length} new, ` +
          `${annotated.length - fresh.length} similar to existing`
      );
      console.log();
      for (const c of annotated) {
        const mark = c.duplicate ? chalk.dim('• dup') : chalk.green('+ new');
        const tag = c.tags.length ? chalk.dim(` --tag ${c.tags.join(',')}`) : '';
        console.log(`  ${mark} ${chalk.cyan(`[${c.type}]`)} ${c.content}${tag}`);
      }
      console.log();
      dim('  Review, then: substrate ingest --apply   (or --plan to let an agent refine)');
      console.log();
      return;
    }

    // Apply: insert fresh candidates with provenance.
    const now = new Date().toISOString();
    const base = captureProvenance({ cwd: root });
    const insert = db.prepare(
      `INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '*', ?, ?, ?)`
    );
    let added = 0;
    for (const c of fresh) {
      const meta = JSON.stringify({ provenance: { ...base, ...c.source, via: 'ingest' } });
      insert.run(
        randomUUID(),
        workspace.id,
        c.type,
        c.content,
        JSON.stringify(c.tags),
        meta,
        now,
        now
      );
      added++;
    }

    const skipped = annotated.length - fresh.length;
    if (options.json) {
      console.log(formatJson({ added, skipped }));
      return;
    }
    success(`Ingested ${added} item(s)${skipped ? `, skipped ${skipped} similar` : ''}`);
    dim('  Review with `substrate ls`, then `substrate sync push` + commit to share.');
  });
