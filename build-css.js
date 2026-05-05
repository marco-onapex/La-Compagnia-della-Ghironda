/**
 * Build CSS Script - Concatenation + esbuild Minification + HTML Injection
 *
 * Two bundles:
 *   CRITICAL — inlined into `.deploy/index.html`'s <style> block
 *              (above-fold: fonts, variables, reset, header, hero, responsive)
 *   DEFERRED — `.deploy/dist/style-deferred.min.css`
 *              (below-fold: typography, sections, print, decorations)
 *
 * Round 20 (option B production-grade): the source `index.html` is
 * NEVER mutated. Build copies source → `.deploy/index.html`, then
 * injects the inline CSS into the copy. Source preserves the empty
 * `<!-- CSS:BEGIN --><!-- CSS:END -->` markers so future builds find
 * the inject point.
 *
 * Minifier: esbuild's CSS minifier (loader: 'css'). Same toolchain as
 * build-js.js, removes the redundant `csso` dependency.
 *
 * Font path fix: i percorsi relativi a dist/ (url('../fonts/'))
 * vengono corretti per la versione inline (url('fonts/')).
 *
 * Utilizzo: node build-css.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Critical bundle: everything strictly required for first paint —
// design tokens, reset, header layout, hero layout, responsive rules.
// This is the absolute minimum to avoid an unstyled flash.
//
// Deferred bundle: typography below-the-fold, section content + footer,
// print, and 9-decorations.css (gradients, ring SVG, decorative
// pseudo-elements). Moving 9-decorations to deferred shaves ~2 KB
// from the inlined critical bundle, lowering the FCP HTML parse cost
// at the price of one repaint when the deferred sheet arrives — that
// repaint is visually negligible (sub-perceptual gradients) and lands
// after the LCP detection window thanks to main.js loading the deferred
// sheet on the `load` event.
const CRITICAL_MODULES = [
  'fonts.css',
  '1-variables.css',
  '2-reset.css',
  '4-header.css',
  '5-hero.css',
  '7-responsive.css',
];

/* fonts-deferred.css ships first in the deferred bundle so the
   @font-face declarations parse before any rules that reference the
   families. */
const DEFERRED_MODULES = [
  'fonts-deferred.css',
  '3-typography.css',
  '6-sections.css',
  '8-print.css',
  '9-decorations.css',
];

const CSS_DIR = path.join(__dirname, 'css');
const DEPLOY_DIR = path.join(__dirname, '.deploy');
const SOURCE_HTML = path.join(__dirname, 'index.html');
const DEPLOY_HTML = path.join(DEPLOY_DIR, 'index.html');
const DEFERRED_OUTPUT = path.join(DEPLOY_DIR, 'dist', 'style-deferred.min.css');

/* Round-23 cleanup gate. Every `.css` file under `css/` MUST appear
   in either CRITICAL_MODULES or DEFERRED_MODULES. Adding a new
   module without listing it would silently exclude it from both
   bundles — the file would ship with the repo but never load in the
   browser, and the bug would surface only the first time someone
   noticed missing styles. The cross-check below converts that
   silent drift into a build-time error. Files that intentionally
   live in `css/` but must NOT bundle (none today) belong in the
   IGNORED set with a comment. */
const IGNORED_CSS_FILES = new Set();
const allListed = new Set([...CRITICAL_MODULES, ...DEFERRED_MODULES, ...IGNORED_CSS_FILES]);
const onDisk = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));
const unlisted = onDisk.filter((f) => !allListed.has(f));
if (unlisted.length > 0) {
  console.error(
    `[ERROR] CSS module(s) on disk but not in CRITICAL_MODULES or DEFERRED_MODULES: ${unlisted.join(', ')}\n` +
      `Add each file to the appropriate array in build-css.js, or to IGNORED_CSS_FILES with a justifying comment.`,
  );
  process.exit(1);
}
const missing = [...CRITICAL_MODULES, ...DEFERRED_MODULES].filter((f) => !onDisk.includes(f));
if (missing.length > 0) {
  console.error(
    `[ERROR] CSS module(s) listed in build-css.js but missing from disk: ${missing.join(', ')}`,
  );
  process.exit(1);
}

const CSS_INJECT_START = '<!-- CSS:BEGIN -->';
const CSS_INJECT_END = '<!-- CSS:END -->';

function concatModules(modules) {
  let result = '';
  modules.forEach((module) => {
    const filePath = path.join(CSS_DIR, module);
    if (!fs.existsSync(filePath)) {
      console.error(`[ERROR] CSS module not found: ${filePath}`);
      process.exit(1);
    }
    result += fs.readFileSync(filePath, 'utf8') + '\n\n';
  });
  return result;
}

// Convert CSS Level 4 media range syntax to Level 3 (esbuild's CSS minifier
// supports both, but the legacy syntax is the lowest common denominator across
// browsers and any CDN-side post-processing).
function convertMediaRanges(css) {
  const adj = (n, unit, delta) => `${Number.parseInt(n, 10) + delta}${unit}`;
  return css
    .replaceAll(/\(\s*width\s*>=\s*(\d+)(px|em|rem)\s*\)/g, '(min-width: $1$2)')
    .replaceAll(/\(\s*width\s*<=\s*(\d+)(px|em|rem)\s*\)/g, '(max-width: $1$2)')
    .replaceAll(
      /\(\s*width\s*>\s*(\d+)(px|em|rem)\s*\)/g,
      (_, n, u) => `(min-width: ${adj(n, u, 1)})`,
    )
    .replaceAll(
      /\(\s*width\s*<\s*(\d+)(px|em|rem)\s*\)/g,
      (_, n, u) => `(max-width: ${adj(n, u, -1)})`,
    )
    .replaceAll(/\(\s*height\s*>=\s*(\d+)(px|em|rem)\s*\)/g, '(min-height: $1$2)')
    .replaceAll(/\(\s*height\s*<=\s*(\d+)(px|em|rem)\s*\)/g, '(max-height: $1$2)')
    .replaceAll(
      /\(\s*height\s*>\s*(\d+)(px|em|rem)\s*\)/g,
      (_, n, u) => `(min-height: ${adj(n, u, 1)})`,
    )
    .replaceAll(
      /\(\s*height\s*<\s*(\d+)(px|em|rem)\s*\)/g,
      (_, n, u) => `(max-height: ${adj(n, u, -1)})`,
    );
}

function minifyCSS(raw, label) {
  const converted = convertMediaRanges(raw);
  const result = esbuild.transformSync(converted, {
    loader: 'css',
    minify: true,
    legalComments: 'none',
  });
  if (!result.code || result.code.length === 0) {
    console.error(`[ERROR] Minification produced empty output for ${label}`);
    process.exit(1);
  }
  return result.code;
}

fs.mkdirSync(path.join(DEPLOY_DIR, 'dist'), { recursive: true });

// ── Critical bundle ─────────────────────────────────────────────────────────
console.log('📦 Building critical CSS...');
const criticalRaw = concatModules(CRITICAL_MODULES);
const criticalMin = minifyCSS(criticalRaw, 'critical');

// ── Deferred bundle ──────────────────────────────────────────────────────────
console.log('📦 Building deferred CSS...');
const deferredRaw = concatModules(DEFERRED_MODULES);
const deferredMin = minifyCSS(deferredRaw, 'deferred');
fs.writeFileSync(DEFERRED_OUTPUT, deferredMin);

const deferredKB = (Buffer.byteLength(deferredMin, 'utf8') / 1024).toFixed(2);
const criticalKB = (Buffer.byteLength(criticalMin, 'utf8') / 1024).toFixed(2);
console.log(`✅ Critical CSS: ${criticalKB} KB`);
console.log(`✅ Deferred CSS: ${deferredKB} KB → .deploy/dist/style-deferred.min.css`);

// ── Inject critical CSS inline into index.html ────────────────────────────────
// The inlined bundle lives at the document root (index.html), so any
// `url('../fonts/...')` / `url('../images/...')` references coming from
// modules originally written for dist/ must shed the leading `../`.
const inlineCSS = criticalMin
  .replaceAll("url('../fonts/", "url('fonts/")
  .replaceAll("url('../images/", "url('images/")
  .replaceAll('url("../fonts/', 'url("fonts/')
  .replaceAll('url("../images/', 'url("images/');

if (!fs.existsSync(SOURCE_HTML)) {
  console.error('[ERROR] source index.html not found — cannot inject critical CSS');
  process.exit(1);
}

/* Read SOURCE index.html (never mutated under round-20 architecture).
   Inject inline CSS, write to `.deploy/index.html`. Source preserves
   the empty `<!-- CSS:BEGIN --><!-- CSS:END -->` markers; the
   built copy in `.deploy/` carries the inlined `<style>` block. */
const html = fs.readFileSync(SOURCE_HTML, 'utf8');
const startIdx = html.indexOf(CSS_INJECT_START);
const endIdx = html.indexOf(CSS_INJECT_END);

if (startIdx === -1 || endIdx === -1) {
  console.error(
    '[ERROR] CSS:BEGIN/CSS:END markers not found in index.html — critical CSS NOT injected. Build aborted to avoid degraded LCP in production.',
  );
  process.exit(1);
}

const before = html.slice(0, Math.max(0, startIdx + CSS_INJECT_START.length));
const after = html.slice(Math.max(0, endIdx));
const newHTML = before + `<style>${inlineCSS}</style>` + after;
fs.writeFileSync(DEPLOY_HTML, newHTML);
const htmlSize = (Buffer.byteLength(newHTML, 'utf8') / 1024).toFixed(2);
console.log(`✅ Critical CSS iniettato in .deploy/index.html (HTML totale: ${htmlSize} KB)`);
