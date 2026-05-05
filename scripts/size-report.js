#!/usr/bin/env node
/**
 * Size Report
 *
 * Prints uncompressed KB sizes for the three shipped artefacts:
 *   - Critical CSS, inlined in `.deploy/index.html` between <style>…</style>
 *   - Deferred CSS, in `.deploy/dist/style-deferred.min.css`
 *   - JS bundle, in `.deploy/dist/main.min.js`
 *
 * Round 20 (option B): all artefacts live under `.deploy/`. Source
 * `index.html` has empty CSS:BEGIN/END placeholders and is not what
 * ships — measuring it would under-report critical CSS by ~6 KB.
 *
 * Output is informational only — performance budgets are enforced by
 * scripts/performance-budget.js (gzip sizes), which runs immediately after.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractInlineStyles } from './lib/extract-inline-styles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEPLOY = path.join(ROOT, '.deploy');
const HTML_FILE = path.join(DEPLOY, 'index.html');
const CSS_DEF = path.join(DEPLOY, 'dist', 'style-deferred.min.css');
const JS_FILE = path.join(DEPLOY, 'dist', 'main.min.js');

/* size-report runs after build:css + build:js in `npm run build`, but it can
   also be invoked standalone (`npm run size-report`) — guard against missing
   dist/ artefacts so we emit a clear hint instead of a raw ENOENT trace. */
const missing = [HTML_FILE, CSS_DEF, JS_FILE].filter((p) => !fs.existsSync(p));
if (missing.length) {
  console.error('[ERROR] size-report: artefatti mancanti:');
  for (const p of missing) {
    console.error(`  - ${path.relative(ROOT, p)}`);
  }
  console.error('Esegui prima `npm run build`.');
  process.exit(1);
}

const html = fs.readFileSync(HTML_FILE, 'utf8');
const inlineCss = extractInlineStyles(html).join('');
const critCssKB = Buffer.byteLength(inlineCss, 'utf8') / 1024;
const defCssKB = fs.statSync(CSS_DEF).size / 1024;
const jsKB = fs.statSync(JS_FILE).size / 1024;

console.log('\n=== Bundle Size Report ===');
console.log(`CSS critical (inlined in HTML):    ${critCssKB.toFixed(2)} KB`);
console.log(`CSS deferred (.deploy/dist/):      ${defCssKB.toFixed(2)} KB`);
console.log(`JS (.deploy/dist/):                ${jsKB.toFixed(2)} KB`);
console.log(`Total (uncompressed):              ${(critCssKB + defCssKB + jsKB).toFixed(2)} KB\n`);
