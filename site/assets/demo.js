/* Substrate landing — animated terminal demo + copy button. No dependencies. */
(() => {
  'use strict';

  // The workflow, as a sequence of lines.
  //   cmd  -> typed out after a "$ " prompt
  //   out  -> printed instantly (optionally styled)
  //   sep  -> a dim divider line
  const SCRIPT = [
    { t: 'cmd', text: 'substrate add "Use Postgres for ACID" --type decision' },
    { t: 'out', text: '✓ Added decision', cls: 'ok' },
    { t: 'cmd', text: 'substrate add "Local DB on port 5544" --type note --private' },
    { t: 'out', text: '✓ Added note (private)', cls: 'ok' },
    { t: 'cmd', text: 'substrate sync push' },
    { t: 'out', text: '✓ Wrote 1 shared item — and 1 private (stays local)', cls: 'ok' },
    { t: 'cmd', text: 'git add .substrate && git commit -m "context" && git push' },
    { t: 'sep', text: '— teammate clones the repo —' },
    { t: 'cmd', text: 'git pull && substrate sync pull' },
    {
      t: 'out',
      text: '✓ Pulled 1 new item  (the private note never left your machine)',
      cls: 'ok'
    },
    { t: 'cmd', text: 'substrate brief --format agent' },
    { t: 'out', text: '# Project Context', cls: 'muted' },
    { t: 'out', text: '· [decision] Use Postgres for ACID', cls: 'muted' }
  ];

  const TYPE_MS = 26;
  const AFTER_CMD_MS = 320;
  const AFTER_OUT_MS = 520;
  const RESTART_MS = 4200;

  const body = document.getElementById('demo-body');
  if (!body) return;

  const cursor = document.createElement('span');
  cursor.className = 'cursor';

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function line(html, cls) {
    const div = document.createElement('div');
    if (cls) div.className = cls;
    div.innerHTML = html;
    body.appendChild(div);
    return div;
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function typeCmd(text) {
    const div = line('<span class="prompt">$</span> ');
    div.appendChild(cursor);
    for (const ch of text) {
      cursor.insertAdjacentText('beforebegin', ch);
      await sleep(TYPE_MS);
    }
    cursor.remove();
    body.scrollTop = body.scrollHeight;
  }

  async function run() {
    for (;;) {
      body.textContent = '';
      for (const step of SCRIPT) {
        if (step.t === 'cmd') {
          await typeCmd(step.text);
          await sleep(AFTER_CMD_MS);
        } else if (step.t === 'sep') {
          line('<span class="sep">' + esc(step.text) + '</span>');
          await sleep(AFTER_OUT_MS);
        } else {
          line('<span class="' + (step.cls || '') + '">' + esc(step.text) + '</span>');
          await sleep(AFTER_OUT_MS);
        }
        body.scrollTop = body.scrollHeight;
      }
      body.appendChild(cursor);
      await sleep(RESTART_MS);
    }
  }

  // Respect reduced-motion: render the whole script statically.
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    for (const step of SCRIPT) {
      if (step.t === 'cmd') line('<span class="prompt">$</span> ' + esc(step.text));
      else if (step.t === 'sep') line('<span class="sep">' + esc(step.text) + '</span>');
      else line('<span class="' + (step.cls || '') + '">' + esc(step.text) + '</span>');
    }
  } else {
    run();
  }

  // Copy-to-clipboard buttons.
  document.querySelectorAll('.copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(text);
        const hint = btn.querySelector('.copy-hint');
        if (hint) {
          const prev = hint.textContent;
          hint.textContent = 'copied ✓';
          btn.classList.add('copied');
          setTimeout(() => {
            hint.textContent = prev;
            btn.classList.remove('copied');
          }, 1500);
        }
      } catch (_) {
        /* clipboard unavailable */
      }
    });
  });
})();
