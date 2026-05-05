#!/usr/bin/env node
/**
 * Cache-Bust Script
 *
 * Appends a content hash (?v=XXXXXXXX) to the dist/main.min.js src attribute
 * in index.html so browsers always fetch the latest JS after each deploy.
 * Also rewrites the Service Worker's CACHE_NAME so old caches are evicted.
 *
 * Hash composition: SHA-256 over the concatenation of every cacheable asset
 *   1. dist/main.min.js                  (JS bundle)
 *   2. dist/style-deferred.min.css       (deferred CSS)
 *   3. inlined critical CSS (from index.html <style>...</style>)
 *   4. images/ghironda-rings.svg         (decorative rings background)
 *   5. images/ghironda-720.webp          (LCP hero image at desktop reference)
 *   6. fonts/cinzel-700-lcp.woff2        (LCP font subset)
 *   7. fonts/cinzel-400.woff2            (body, deferred)
 *   8. fonts/cinzel-600.woff2            (nav, deferred)
 *   9. fonts/cinzel-700.woff2            (full Cinzel-700, deferred)
 *   10. fonts/crimson-text-400-italic.woff2 (Crimson Text italic, deferred)
 *
 * The page-level fonts (7-9) are referenced from CSS but cached via
 * stale-while-revalidate (not in PRECACHE). Including them in the
 * composite ensures a font subset regen — e.g. after editing
 * scripts/subset-fonts-page.js — invalidates every SW cache so
 * returning visitors see the new bytes instead of replaying the old
 * cached copy until the SWR refresh lands.
 *
 * Why this matters: previously the hash was JS-only. CSS-only or HTML-only
 * changes did NOT invalidate the SW cache, so users could see stale assets
 * after a deploy that didn't touch JS. The composite hash invalidates on any
 * change to the deployed bundle.
 *
 * Runs after both build:css and build:js, before build:csp.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { extractInlineStyles } from './lib/extract-inline-styles.js';
import { findRepoRoot } from './lib/repo-root.js';

const ROOT = findRepoRoot();
const DEPLOY = path.join(ROOT, '.deploy');

/* Round 20 (option B production-grade): every input is read from
   `.deploy/` (after build:css + build:js + copy-static-assets have
   populated it), and every write goes back to `.deploy/`. The source
   tree is read-only. */
const JS_FILE = path.join(DEPLOY, 'dist', 'main.min.js');
const CSS_DEF = path.join(DEPLOY, 'dist', 'style-deferred.min.css');
const HTML_FILE = path.join(DEPLOY, 'index.html');
const SW_FILE = path.join(DEPLOY, 'sw.js');
const RINGS_SVG = path.join(DEPLOY, 'images', 'ghironda-rings.svg');
const HERO_IMG = path.join(DEPLOY, 'images', 'ghironda-720.webp');
const LCP_FONT = path.join(DEPLOY, 'fonts', 'cinzel-700-lcp.woff2');
const BODY_FONT = path.join(DEPLOY, 'fonts', 'cinzel-400.woff2');
const NAV_FONT = path.join(DEPLOY, 'fonts', 'cinzel-600.woff2');
const FULL_FONT = path.join(DEPLOY, 'fonts', 'cinzel-700.woff2');
const ITALIC_FONT = path.join(DEPLOY, 'fonts', 'crimson-text-400-italic.woff2');

/* Every input that contributes to the composite hash MUST exist before we
   compute the digest. The previous code silently fell back to
   `Buffer.alloc(0)` when CSS_DEF / RINGS_SVG / HERO_IMG were absent — that
   produced a hash that *looked* deterministic but actually depended on
   which assets happened to be present at build time, leading to subtle
   cache-eviction bugs between local and CI builds. Failing loudly here
   is the only way to keep the SW cache key honest. */
const REQUIRED = [
  ['.deploy/dist/main.min.js (run build:js first)', JS_FILE],
  ['.deploy/dist/style-deferred.min.css (run build:css first)', CSS_DEF],
  ['.deploy/index.html (run build:css first)', HTML_FILE],
  /* sw.js MUST exist — it's mirrored from source by build:assets and
     mutated below (CACHE_NAME injection). The previous code wrapped
     the SW rewrite in `if (existsSync(SW_FILE))` which silently
     skipped the cache-name update if copy-static-assets.js had
     failed to copy sw.js. That hid bugs: a deploy with stale
     CACHE_NAME would still ship without complaint. */
  ['.deploy/sw.js (run build:assets first)', SW_FILE],
  ['.deploy/images/ghironda-rings.svg (run build:assets first)', RINGS_SVG],
  ['.deploy/images/ghironda-720.webp (run build:assets first)', HERO_IMG],
  ['.deploy/fonts/cinzel-700-lcp.woff2 (run build:assets first)', LCP_FONT],
  ['.deploy/fonts/cinzel-400.woff2 (run build:assets first)', BODY_FONT],
  ['.deploy/fonts/cinzel-600.woff2 (run build:assets first)', NAV_FONT],
  ['.deploy/fonts/cinzel-700.woff2 (run build:assets first)', FULL_FONT],
  ['.deploy/fonts/crimson-text-400-italic.woff2 (run build:assets first)', ITALIC_FONT],
];
for (const [label, file] of REQUIRED) {
  if (!fs.existsSync(file)) {
    console.error(`[ERROR] cache-bust input missing: ${label}`);
    process.exit(1);
  }
}

const htmlContent = fs.readFileSync(HTML_FILE, 'utf8');
/* Hash EVERY inline <style> block (not just the first) so adding a
   second one (e.g. a print-only above-fold block in the future)
   participates in the composite hash. The shared
   `extractInlineStyles` helper enforces the multi-block contract
   uniformly across cache-bust + size-report + performance-budget. */
const inlineStyles = extractInlineStyles(htmlContent);
if (inlineStyles.length === 0) {
  console.error('[ERROR] inline <style> block not found in index.html — run build:css first');
  process.exit(1);
}
const inlineStyle = inlineStyles.join('');

const hash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(JS_FILE))
  .update(fs.readFileSync(CSS_DEF))
  .update(Buffer.from(inlineStyle, 'utf8'))
  .update(fs.readFileSync(RINGS_SVG))
  .update(fs.readFileSync(HERO_IMG))
  .update(fs.readFileSync(LCP_FONT))
  .update(fs.readFileSync(BODY_FONT))
  .update(fs.readFileSync(NAV_FONT))
  .update(fs.readFileSync(FULL_FONT))
  .update(fs.readFileSync(ITALIC_FONT))
  .digest('hex')
  .slice(0, 8);

// ── 1. Update index.html script src ──────────────────────────────────────────
const JS_SRC_RE = /src="dist\/main\.min\.js(?:\?v=[a-f0-9]+)?"/;
const htmlBefore = fs.readFileSync(HTML_FILE, 'utf8');

if (!JS_SRC_RE.test(htmlBefore)) {
  console.error(
    '[ERROR] src="dist/main.min.js" pattern not found in index.html — cache-bust aborted. Build halted to avoid shipping a stale hash.',
  );
  process.exit(1);
}

const htmlAfter = htmlBefore.replace(JS_SRC_RE, `src="dist/main.min.js?v=${hash}"`);
if (htmlAfter !== htmlBefore) {
  fs.writeFileSync(HTML_FILE, htmlAfter);
}
console.log(`✅ Cache-bust HTML: dist/main.min.js?v=${hash}`);

// ── 2. Update service worker CACHE_NAME ──────────────────────────────────────
/* Matches one of two valid states:
     1. The source-pure placeholder: 'ghironda-PLACEHOLDER'
     2. A previously-injected hex hash: 'ghironda-XXXXXXXX' (8 hex)

   The previous regex used `[a-zA-Z0-9]+` which silently accepted
   ANY alnum sequence (e.g. a hand-edit to 'ghironda-WIP' would be
   re-rewritten without complaint). The strict alternation rejects
   garbage values and forces a clear error if the SW source has
   drifted from the documented two states. */
const SW_CACHE_RE = /const CACHE_NAME\s*=\s*'ghironda-(?:[a-f0-9]{8}|PLACEHOLDER)'/;
const swBefore = fs.readFileSync(SW_FILE, 'utf8');

if (!SW_CACHE_RE.test(swBefore)) {
  console.error(
    `[ERROR] CACHE_NAME pattern not found in .deploy/sw.js — SW cache-bust aborted. ` +
      `Expected one of:\n` +
      `  const CACHE_NAME = 'ghironda-PLACEHOLDER'   (source-pure state)\n` +
      `  const CACHE_NAME = 'ghironda-<8-hex>'       (post-build state)\n` +
      `Found something else — likely a hand-edit. Restore the placeholder and re-run build.`,
  );
  process.exit(1);
}

const swAfter = swBefore.replace(SW_CACHE_RE, `const CACHE_NAME = 'ghironda-${hash}'`);
if (swAfter !== swBefore) {
  fs.writeFileSync(SW_FILE, swAfter);
}
console.log(`✅ Cache-bust SW:   CACHE_NAME = 'ghironda-${hash}'`);
