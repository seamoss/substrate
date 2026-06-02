import { describe, it, expect } from 'vitest';
import { scopeMatches, scopeMatchesAny, isSpecificScope } from '../../src/lib/scope.js';

describe('lib/scope', () => {
  it('global scope matches everything', () => {
    expect(scopeMatches('*', 'src/a.js')).toBe(true);
    expect(scopeMatches('', 'src/a.js')).toBe(true);
  });

  it('directory/file prefixes match themselves and descendants', () => {
    expect(scopeMatches('src/api', 'src/api/users.js')).toBe(true);
    expect(scopeMatches('src/api', 'src/api')).toBe(true);
    expect(scopeMatches('src/api/users.js', 'src/api/users.js')).toBe(true);
    expect(scopeMatches('src/api', 'src/apiX/y.js')).toBe(false);
    expect(scopeMatches('src/api', 'src/web/x.js')).toBe(false);
  });

  it('globs match', () => {
    expect(scopeMatches('src/*/users.js', 'src/api/users.js')).toBe(true);
    expect(scopeMatches('src/api/*.js', 'src/api/users.js')).toBe(true);
    expect(scopeMatches('src/api/*.js', 'src/api/users.ts')).toBe(false);
  });

  it('scopeMatchesAny / isSpecificScope', () => {
    expect(scopeMatchesAny('src/api', ['README.md', 'src/api/x.js'])).toBe(true);
    expect(scopeMatchesAny('src/api', ['README.md'])).toBe(false);
    expect(isSpecificScope('*')).toBe(false);
    expect(isSpecificScope('')).toBe(false);
    expect(isSpecificScope('src/api')).toBe(true);
  });
});
