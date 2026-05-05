#!/usr/bin/env node
/**
 * strip-html-comments — final build step that removes every `<!-- ... -->`
 * comment block from `.deploy/index.html` EXCEPT the build-pipeline markers
 * that subsequent rebuilds rely on.
 *
 * Why: the deployed HTML has no need for descriptive comments. They
 * live in source for maintainability but inflate the byte count
 * shipped to every visitor. The architectural narrative they encode
 * is already captured in ARCHITECTURE.md / CSS-ARCHITECTURE.md /
 * PERFORMANCE-STRATEGY.md — losing the inline duplicates does not
 * lose information.
 *
 * Round 20 (option B): operates on `.deploy/index.html`. Source
 * `index.html` is read-only — the strip never touches it.
 *
 * What is preserved:
 *   - `<!-- CSS:BEGIN -->` / `<!-- CSS:END -->` — kept in `.deploy/`
 *     so the marker contract is consistent across both files even
 *     though `build-css.js` only re-reads them from source.
 *
 * What is removed:
 *   - All other `<!-- ... -->` blocks: descriptive paragraphs
 *     explaining LCP-region preloads, og:image rationale, header
 *     sticky behaviour, checkbox-hack pattern, etc. + any AUTO
 *     marker examples that happened to live inside descriptive
 *     comment blocks (their values were baked in by
 *     `inject-doc-numbers.js` at the previous build step).
 *
 * Idempotent: a second run finds no descriptive comments and exits 0
 * with a no-op log.
 *
 * Position in the build chain (round 20):
 *   build:css → build:js → build:assets → build:sitemap →
 *   build:cache-bust → build:csp → size-report → audit:performance →
 *   docs:numbers → build:strip   ← THIS STEP
 *
 * The order matters: every preceding step needs to find its own
 * marker tokens (CSP hash, cache-bust ?v=, AUTO markers) in
 * `.deploy/index.html` before the strip removes the surrounding
 * descriptive prose.
 *
 * Usage:
 *   node scripts/strip-html-comments.js
 *   npm run build:strip
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { findRepoRoot } from './lib/repo-root.js';

const ROOT = findRepoRoot();
const HTML = path.join(ROOT, '.deploy', 'index.html');

/**
 * Build-pipeline marker tokens that must survive the strip — without
 * them subsequent builds break. Add new ones here only after
 * verifying the corresponding script needs the literal HTML-comment
 * form (most marker scripts use distinct delimiters, e.g.
 * `inject-doc-numbers.js` matches both HTML and JS marker forms).
 */
const PRESERVE_TOKENS = ['CSS:BEGIN', 'CSS:END'];

/**
 * Strip every `<!-- ... -->` block from `html` except those
 * containing any token in `PRESERVE_TOKENS`. Pure: no I/O, exposed
 * for unit testing.
 */
export function stripHtmlComments(html) {
  /* HTML5 comment grammar: opens `<!--`, closes at first `-->`. No
     nesting allowed by spec. The non-greedy `[\s\S]*?` ensures we
     match the smallest comment, not the span from the first `<!--`
     to the last `-->` in the document. */
  const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
  let removed = 0;
  let preserved = 0;
  const stripped = html.replaceAll(HTML_COMMENT_RE, (match) => {
    if (PRESERVE_TOKENS.some((t) => match.includes(t))) {
      preserved++;
      return match;
    }
    removed++;
    return '';
  });
  /* Collapse runs of blank lines that the strip leaves behind, so
     the output isn't full of vertical whitespace where multi-line
     comments used to live. Keeps at most a single blank-line
     separator between blocks. */
  const collapsed = stripped.replaceAll(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');
  return { html: collapsed, removed, preserved };
}

/* istanbul ignore next -- CLI entry; exercised in CI by `npm run build:strip`, not under jest */
if (
  process.argv[1] &&
  process.argv[1].replaceAll('\\', '/').endsWith('/scripts/strip-html-comments.js')
) {
  const before = readFileSync(HTML, 'utf8');
  const beforeBytes = Buffer.byteLength(before, 'utf8');
  const { html: after, removed, preserved } = stripHtmlComments(before);
  const afterBytes = Buffer.byteLength(after, 'utf8');

  if (removed === 0) {
    console.log(
      `✅ strip-html-comments: .deploy/index.html already clean (${preserved} build-marker comment(s) preserved).`,
    );
  } else {
    writeFileSync(HTML, after);
    const savedKB = ((beforeBytes - afterBytes) / 1024).toFixed(2);
    const reductionPct = (((beforeBytes - afterBytes) / beforeBytes) * 100).toFixed(1);
    console.log(
      `✏️  strip-html-comments: removed ${removed} comment(s), preserved ${preserved} build marker(s); ` +
        `.deploy/index.html ${beforeBytes} → ${afterBytes} bytes (-${savedKB} KB, -${reductionPct}%).`,
    );
  }
}
