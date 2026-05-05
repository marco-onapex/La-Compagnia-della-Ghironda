#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { extractInlineStyles } from './lib/extract-inline-styles.js';
import { gzipBytes } from './lib/gzip-size.js';
import { findRepoRoot } from './lib/repo-root.js';

/* Round-21 cleanup: anchor every path lookup to the repo root
   (resolved by the shared `findRepoRoot()` walker), NOT `process.cwd()`.
   Invoking from any subdirectory (e.g. `cd tests && node
   ../scripts/performance-budget.js`) previously made the script
   silently report "dist/ folder not found" or, worse, miss inputs
   and false-pass the budget. */
const ROOT = findRepoRoot();

// Budget calibrated against the live build output (auto-injected
// from `dist/` + inline <style> by `scripts/inject-doc-numbers.js`):
// current /* AUTO:JS_GZIP */1.2/* /AUTO */ KB JS / /* AUTO:CSS_TOTAL_GZIP */5.9/* /AUTO */ KB CSS / /* AUTO:TOTAL_GZIP */7.1/* /AUTO */ KB total gzip.
// History (pre-Apr-2026 follow-up snapshot):
//   - Level B pure-CSS architecture removed observer.js + config.js
//     (~7 KB raw JS) → JS gzip dropped from ~2 KB to ~0.94 KB
//   - 9-decorations.css moved from critical to deferred bundle
//     (LCP-window repaint is sub-perceptual gradients only) →
//     critical CSS gzip dropped 5.63 → 4.71 KB
//   - sw.js refactored to setup(self, env) for Stryker mutation
//     gate (no size change)
// Hard limits represent the architectural ceiling. Warn levels were
// originally tuned to ~+0.2 KB above current; subsequent rounds
// loosened them so the gate doesn't trip on small refactors. Run
// `npm run audit:performance` to see current vs warn vs max.
const PERFORMANCE_BUDGET = {
  js: { max: 3, warn: 1.2 }, // KB gzip — current /* AUTO:JS_GZIP */1.2/* /AUTO */
  css: { max: 7.5, warn: 7.15 }, // KB gzip — current /* AUTO:CSS_TOTAL_GZIP */5.9/* /AUTO */
  total: { max: 10, warn: 8.2 }, // KB gzip — current /* AUTO:TOTAL_GZIP */7.1/* /AUTO */
};

console.log('Checking performance budget (gzip sizes)...\n');

try {
  /* Round 20 (option B): bundle artefacts live under
     `.deploy/dist/`, not `dist/`. Round-21: anchor to ROOT (this
     script's directory), not process.cwd(), so invoking from any
     subdir resolves correctly. */
  const distPath = path.join(ROOT, '.deploy', 'dist');

  if (!fs.existsSync(distPath)) {
    console.error('.deploy/dist/ folder not found. Run: npm run build');
    process.exit(1);
  }

  let jsSize = 0;
  let cssSize = 0;

  const files = fs.readdirSync(distPath);

  files.forEach((file) => {
    const filePath = path.join(distPath, file);
    const content = fs.readFileSync(filePath);
    const gzipSize = gzipBytes(content);
    const sizeKB = (gzipSize / 1024).toFixed(2);

    if (file.endsWith('.js') && !file.endsWith('.map')) {
      jsSize = Number.parseFloat(sizeKB);
      console.log(`${file}: ${sizeKB} KB (gzip)`);
    } else if (file.endsWith('.css')) {
      cssSize += Number.parseFloat(sizeKB);
      console.log(`${file}: ${sizeKB} KB (gzip)`);
    }
  });

  // Critical CSS is inlined into the BUILT copy of index.html
  // (between <style>...</style>) and ships with the document, not as
  // a separate file in `.deploy/dist/`. Account for its size so the
  // CSS budget check covers ALL CSS the browser actually downloads on
  // first paint.
  const htmlPath = path.join(ROOT, '.deploy', 'index.html');
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    /* Sum the gzip size of EVERY inline <style> block via the
       shared helper. Multi-block correctness is guaranteed by the
       extractor's contract (same one cache-bust + size-report use). */
    const inlineStyles = extractInlineStyles(html);
    if (inlineStyles.length > 0) {
      const allInline = inlineStyles.join('');
      const inlineGzip = gzipBytes(allInline);
      const inlineKB = Number.parseFloat((inlineGzip / 1024).toFixed(2));
      cssSize += inlineKB;
      console.log(
        `index.html (inlined critical CSS, ${inlineStyles.length} block${inlineStyles.length === 1 ? '' : 's'}): ${inlineKB.toFixed(2)} KB (gzip)`,
      );
    }
  }

  const totalSize = jsSize + cssSize;
  let hasWarning = false;
  let hasError = false;

  console.log('\nPerformance Budget Analysis (gzip):\n');

  // Check JS
  if (jsSize > PERFORMANCE_BUDGET.js.max) {
    console.error(`JS exceeds max budget: ${jsSize} KB > ${PERFORMANCE_BUDGET.js.max} KB`);
    hasError = true;
  } else if (jsSize > PERFORMANCE_BUDGET.js.warn) {
    console.log(`JS approaching limit: ${jsSize} KB > ${PERFORMANCE_BUDGET.js.warn} KB (warning)`);
    hasWarning = true;
  } else {
    console.log(`JS within budget: ${jsSize} KB / ${PERFORMANCE_BUDGET.js.max} KB`);
  }

  // Check CSS
  if (cssSize > PERFORMANCE_BUDGET.css.max) {
    console.error(`CSS exceeds max budget: ${cssSize} KB > ${PERFORMANCE_BUDGET.css.max} KB`);
    hasError = true;
  } else if (cssSize > PERFORMANCE_BUDGET.css.warn) {
    console.log(
      `CSS approaching limit: ${cssSize} KB > ${PERFORMANCE_BUDGET.css.warn} KB (warning)`,
    );
    hasWarning = true;
  } else {
    console.log(`CSS within budget: ${cssSize} KB / ${PERFORMANCE_BUDGET.css.max} KB`);
  }

  // Check Total
  if (totalSize > PERFORMANCE_BUDGET.total.max) {
    console.error(`Total exceeds max budget: ${totalSize} KB > ${PERFORMANCE_BUDGET.total.max} KB`);
    hasError = true;
  } else if (totalSize > PERFORMANCE_BUDGET.total.warn) {
    console.log(
      `Total approaching limit: ${totalSize} KB > ${PERFORMANCE_BUDGET.total.warn} KB (warning)`,
    );
    hasWarning = true;
  } else {
    console.log(`Total within budget: ${totalSize} KB / ${PERFORMANCE_BUDGET.total.max} KB`);
  }

  if (hasError) {
    console.error('\nPerformance budget exceeded!');
    process.exit(1);
  }

  if (hasWarning) {
    console.log('\nPerformance budget warning (non-blocking)');
  } else {
    console.log('\nPerformance budget met');
  }
} catch (error) {
  console.error('Error checking performance budget:', error.message);
  process.exit(1);
}
