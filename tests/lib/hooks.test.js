import { describe, it, expect } from 'vitest';
import { hasManagedBlock, addManagedBlock, removeManagedBlock } from '../../src/commands/hooks.js';

describe('hooks managed block', () => {
  it('seeds an empty file with a shebang + block', () => {
    const out = addManagedBlock('');
    expect(out.startsWith('#!/bin/sh')).toBe(true);
    expect(hasManagedBlock(out)).toBe(true);
  });

  it('appends to an existing hook without clobbering it', () => {
    const out = addManagedBlock('#!/bin/sh\necho hello\n');
    expect(out).toContain('echo hello');
    expect(hasManagedBlock(out)).toBe(true);
  });

  it('is idempotent', () => {
    const once = addManagedBlock('#!/bin/sh\necho hi\n');
    expect(addManagedBlock(once)).toBe(once);
  });

  it('removes the block while preserving other content', () => {
    const withBlock = addManagedBlock('#!/bin/sh\necho hello\n');
    const removed = removeManagedBlock(withBlock);
    expect(hasManagedBlock(removed)).toBe(false);
    expect(removed).toContain('echo hello');
  });
});
