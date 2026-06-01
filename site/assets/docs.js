/* Substrate docs viewer — client-side, zero-build. Renders docs/*.md with marked. */
(() => {
  'use strict';

  // Ordered nav. `slug` maps to docs/<slug>.md (single source of truth).
  const DOCS = [
    { slug: 'getting-started', title: 'Getting Started' },
    { slug: 'cli-reference', title: 'CLI Reference' },
    { slug: 'sync', title: 'Sync & Sharing' },
    { slug: 'agent-integration', title: 'Agent Integration (MCP)' },
    { slug: 'claude-code', title: 'Claude Code' },
    { slug: 'cursor', title: 'Cursor' },
    { slug: 'windsurf', title: 'Windsurf' },
    { slug: 'github-copilot', title: 'GitHub Copilot' },
    { slug: 'zed', title: 'Zed' },
    { slug: 'warp', title: 'Warp' }
  ];
  const SLUGS = new Set(DOCS.map(d => d.slug));
  const GH_BLOB = 'https://github.com/seamoss/substrate/blob/main/';

  const nav = document.getElementById('docs-nav');
  const content = document.getElementById('docs-content');

  // Build the sidebar.
  for (const d of DOCS) {
    const a = document.createElement('a');
    a.href = '#/' + d.slug;
    a.textContent = d.title;
    a.dataset.slug = d.slug;
    nav.appendChild(a);
  }

  function currentSlug() {
    const m = location.hash.match(/^#\/([\w-]+)/);
    const slug = m && m[1];
    return SLUGS.has(slug) ? slug : 'getting-started';
  }

  function setActive(slug) {
    nav.querySelectorAll('a').forEach(a => {
      a.classList.toggle('active', a.dataset.slug === slug);
    });
  }

  // Rewrite links in rendered markdown: doc-to-doc `.md` links become hash routes;
  // other repo `.md` links point at GitHub.
  function fixLinks(root) {
    root.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return;
      const clean = href.split('#')[0].split('?')[0];
      if (!clean.endsWith('.md')) return;
      const base = clean.split('/').pop().replace(/\.md$/, '');
      if (SLUGS.has(base) && !clean.includes('/')) {
        a.setAttribute('href', '#/' + base);
      } else {
        a.setAttribute('href', GH_BLOB + clean.replace(/^(\.\/|\.\.\/)+/, ''));
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      }
    });
  }

  async function render() {
    const slug = currentSlug();
    setActive(slug);
    content.innerHTML = '<p class="docs-loading">Loading…</p>';
    try {
      const res = await fetch('docs/' + slug + '.md', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const md = await res.text();
      content.innerHTML = window.marked.parse(md);
      fixLinks(content);
      window.scrollTo(0, 0);
      content.scrollTop = 0;
      const title = DOCS.find(d => d.slug === slug);
      document.title = 'Substrate — ' + (title ? title.title : 'Docs');
    } catch (err) {
      content.innerHTML =
        '<p class="docs-error">Could not load <code>docs/' +
        slug +
        '.md</code> (' +
        err.message +
        '). View it on <a href="' +
        GH_BLOB +
        'docs/' +
        slug +
        '.md">GitHub</a>.</p>';
    }
  }

  window.addEventListener('hashchange', render);
  render();
})();
