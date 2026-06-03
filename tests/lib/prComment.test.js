import { describe, it, expect } from 'vitest';
import { renderComment, COMMENT_MARKER } from '../../src/lib/prComment.js';

describe('lib/prComment', () => {
  it('begins with the marker and shows an empty state', () => {
    const out = renderComment({ items: [], changedCount: 3 });
    expect(out.startsWith(COMMENT_MARKER)).toBe(true);
    expect(out).toContain('No tracked context governs the 3 changed file(s)');
  });

  it('sorts by type and renders provenance + files', () => {
    const out = renderComment({
      changedCount: 2,
      items: [
        {
          id: '1',
          type: 'decision',
          content: 'Use Stripe',
          provenance: { commit: 'abc1234' },
          files: ['src/pay.js']
        },
        {
          id: '2',
          type: 'constraint',
          content: 'Tokens expire after 24h',
          provenance: { file: 'README.md' },
          files: ['src/auth.js', 'src/api/x.js', 'y.js', 'z.js']
        }
      ]
    });

    // constraint sorts before decision
    expect(out.indexOf('Tokens expire after 24h')).toBeLessThan(out.indexOf('Use Stripe'));
    expect(out).toContain('**[constraint]**');
    expect(out).toContain('_(from README.md)_');
    expect(out).toContain('`abc1234`');
    expect(out).toContain('+1 more'); // 4 files → 3 shown + "+1 more"
  });
});
