import { describe, it, expect } from 'vitest';

// Test the file categorization and suggestion logic directly
// These are the internal functions from extract.js - we'll test the logic

describe('Extract Logic', () => {
  // File type patterns
  // Order matters - more specific patterns first
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

  describe('categorizeFile', () => {
    it('should identify config files', () => {
      expect(categorizeFile('package.json')).toBe('config');
      expect(categorizeFile('config.yaml')).toBe('config');
      expect(categorizeFile('settings.yml')).toBe('config');
      expect(categorizeFile('.env')).toBe('config');
      expect(categorizeFile('vite.config.js')).toBe('config');
      expect(categorizeFile('vitest.config.ts')).toBe('config');
    });

    it('should identify test files', () => {
      expect(categorizeFile('foo.test.js')).toBe('test');
      expect(categorizeFile('bar.spec.ts')).toBe('test');
      expect(categorizeFile('__tests__/utils.js')).toBe('test');
      expect(categorizeFile('src/components/__tests__/Button.tsx')).toBe('test');
    });

    it('should identify schema files', () => {
      expect(categorizeFile('prisma/schema.prisma')).toBe('schema');
      expect(categorizeFile('src/models/user.js')).toBe('schema');
      expect(categorizeFile('api/schema.graphql')).toBe('schema');
      expect(categorizeFile('src/schemas/user.ts')).toBe('schema');
    });

    it('should identify documentation files', () => {
      expect(categorizeFile('README.md')).toBe('docs');
      expect(categorizeFile('docs/getting-started.md')).toBe('docs');
      expect(categorizeFile('CHANGELOG.txt')).toBe('docs');
    });

    it('should identify API files', () => {
      expect(categorizeFile('src/routes/users.js')).toBe('api');
      expect(categorizeFile('api/v1/auth.ts')).toBe('api');
      expect(categorizeFile('controllers/userController.js')).toBe('api');
      expect(categorizeFile('src/endpoints/health.js')).toBe('api');
    });

    it('should identify migration files', () => {
      expect(categorizeFile('migrations/001_create_users.sql')).toBe('migration');
      expect(categorizeFile('db/migration/add_index.js')).toBe('migration');
    });

    it('should return null for uncategorized files', () => {
      expect(categorizeFile('src/utils/helpers.js')).toBeNull();
      expect(categorizeFile('index.js')).toBeNull();
      expect(categorizeFile('styles.css')).toBeNull();
    });
  });

  describe('parseGitDiff', () => {
    function parseGitDiff(diffOutput) {
      const lines = diffOutput.trim().split('\n');
      const files = { added: [], modified: [], deleted: [] };
      const stats = { insertions: 0, deletions: 0, filesChanged: 0 };

      for (const line of lines) {
        const statusMatch = line.match(/^([AMD])\t(.+)$/);
        if (statusMatch) {
          const [, status, filepath] = statusMatch;
          if (status === 'A') files.added.push(filepath);
          else if (status === 'M') files.modified.push(filepath);
          else if (status === 'D') files.deleted.push(filepath);
        }

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

    it('should parse added files', () => {
      const output = `A\tsrc/new-file.js
A\ttests/new-test.js
 2 files changed, 50 insertions(+)`;

      const result = parseGitDiff(output);
      expect(result.files.added).toEqual(['src/new-file.js', 'tests/new-test.js']);
      expect(result.files.modified).toEqual([]);
      expect(result.files.deleted).toEqual([]);
    });

    it('should parse modified files', () => {
      const output = `M\tsrc/existing.js
M\tpackage.json
 2 files changed, 10 insertions(+), 5 deletions(-)`;

      const result = parseGitDiff(output);
      expect(result.files.modified).toEqual(['src/existing.js', 'package.json']);
      expect(result.stats.insertions).toBe(10);
      expect(result.stats.deletions).toBe(5);
    });

    it('should parse deleted files', () => {
      const output = `D\tsrc/old-file.js
 1 file changed, 100 deletions(-)`;

      const result = parseGitDiff(output);
      expect(result.files.deleted).toEqual(['src/old-file.js']);
      expect(result.stats.deletions).toBe(100);
    });

    it('should parse mixed changes', () => {
      const output = `A\tsrc/new.js
M\tsrc/modified.js
D\tsrc/deleted.js
 3 files changed, 25 insertions(+), 10 deletions(-)`;

      const result = parseGitDiff(output);
      expect(result.files.added).toEqual(['src/new.js']);
      expect(result.files.modified).toEqual(['src/modified.js']);
      expect(result.files.deleted).toEqual(['src/deleted.js']);
      expect(result.stats.filesChanged).toBe(3);
    });

    it('should handle stat line with only insertions', () => {
      const output = `A\tnew.js
 1 file changed, 50 insertions(+)`;

      const result = parseGitDiff(output);
      expect(result.stats.insertions).toBe(50);
      expect(result.stats.deletions).toBe(0);
    });

    it('should handle stat line with only deletions', () => {
      const output = `D\told.js
 1 file changed, 30 deletions(-)`;

      const result = parseGitDiff(output);
      expect(result.stats.insertions).toBe(0);
      expect(result.stats.deletions).toBe(30);
    });
  });

  describe('generateSuggestions', () => {
    const FILE_TYPE_HINTS = {
      config: ['decision', 'constraint'],
      test: ['constraint', 'note'],
      schema: ['entity', 'constraint'],
      docs: ['note'],
      api: ['decision', 'entity'],
      migration: ['decision', 'note']
    };

    function generateSuggestions(parsedDiff) {
      const suggestions = [];
      const allFiles = [...parsedDiff.files.added, ...parsedDiff.files.modified];

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
        } else if (category === 'api') {
          suggestions.push({
            type: primaryType,
            hint: `API files changed: ${files.join(', ')}`,
            question: 'What API design decisions were made?',
            command: `substrate add "..." --type ${primaryType} --tag api`
          });
        }
      }

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

    it('should suggest decision for config changes', () => {
      const parsed = {
        files: { added: [], modified: ['package.json', 'config.yaml'], deleted: [] },
        stats: { filesChanged: 2, insertions: 10, deletions: 5 }
      };

      const suggestions = generateSuggestions(parsed);
      const configSuggestion = suggestions.find(s => s.hint.includes('Configuration'));
      expect(configSuggestion).toBeDefined();
      expect(configSuggestion.type).toBe('decision');
    });

    it('should suggest constraint for test changes', () => {
      const parsed = {
        files: { added: ['tests/auth.test.js'], modified: [], deleted: [] },
        stats: { filesChanged: 1, insertions: 50, deletions: 0 }
      };

      const suggestions = generateSuggestions(parsed);
      const testSuggestion = suggestions.find(s => s.hint.includes('Tests'));
      expect(testSuggestion).toBeDefined();
      expect(testSuggestion.type).toBe('constraint');
    });

    it('should suggest decision for API changes', () => {
      const parsed = {
        files: { added: [], modified: ['src/routes/users.js'], deleted: [] },
        stats: { filesChanged: 1, insertions: 20, deletions: 10 }
      };

      const suggestions = generateSuggestions(parsed);
      const apiSuggestion = suggestions.find(s => s.hint.includes('API'));
      expect(apiSuggestion).toBeDefined();
      expect(apiSuggestion.type).toBe('decision');
    });

    it('should suggest overall approach for large changes', () => {
      const parsed = {
        files: {
          added: [],
          modified: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js'],
          deleted: []
        },
        stats: { filesChanged: 6, insertions: 100, deletions: 50 }
      };

      const suggestions = generateSuggestions(parsed);
      const largeSuggestion = suggestions.find(s => s.hint.includes('Large change'));
      expect(largeSuggestion).toBeDefined();
      expect(largeSuggestion.type).toBe('decision');
    });

    it('should suggest note for new files', () => {
      const parsed = {
        files: { added: ['src/utils/newHelper.js'], modified: [], deleted: [] },
        stats: { filesChanged: 1, insertions: 30, deletions: 0 }
      };

      const suggestions = generateSuggestions(parsed);
      const newFileSuggestion = suggestions.find(s => s.hint.includes('New files'));
      expect(newFileSuggestion).toBeDefined();
      expect(newFileSuggestion.type).toBe('note');
    });

    it('should truncate file list with ellipsis when many files', () => {
      const parsed = {
        files: { added: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'], modified: [], deleted: [] },
        stats: { filesChanged: 5, insertions: 100, deletions: 0 }
      };

      const suggestions = generateSuggestions(parsed);
      const newFileSuggestion = suggestions.find(s => s.hint.includes('New files'));
      expect(newFileSuggestion.hint).toContain('...');
    });

    it('should return empty suggestions for changes with no categorizable files', () => {
      const parsed = {
        files: { added: [], modified: ['src/utils/helper.js'], deleted: [] },
        stats: { filesChanged: 1, insertions: 5, deletions: 2 }
      };

      const suggestions = generateSuggestions(parsed);
      // No config, test, api, etc. - only uncategorizable file
      // Should return empty since the file doesn't match any pattern
      expect(suggestions).toHaveLength(0);
    });
  });
});
