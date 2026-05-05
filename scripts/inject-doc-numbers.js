#!/usr/bin/env node
/**
 * Doc-numbers injector — replaces `<!-- AUTO:KEY -->...<!-- /AUTO -->`
 * markers in tracked Markdown / JSON files with values computed live
 * from the production sources (dist/, css/, scripts/performance-budget.js,
 * package.json, etc.).
 *
 * The drift class this closes:
 *   Manually-maintained numeric / version claims in prose docs that
 *   silently get out-of-sync with the build output. Across rounds 6-8
 *   of the Apr 2026 follow-up, every fresh-eyes evaluation kept finding
 *   another instance of this drift class — bundle sizes, budget
 *   thresholds, CSS variable count, Node engine version. Each round
 *   was a regex-grep race against the next instance the previous
 *   round missed. This script is the structural fix: any doc that
 *   wraps a number in an AUTO marker gets re-injected on every
 *   build, removing the manual-update loop entirely.
 *
 * Two marker syntaxes — pick the one whose host file's comment
 * grammar accepts it:
 *
 *   HTML / Markdown / JSON-with-comments (default for *.md, *.json):
 *     ~<!-- AUTO:JS_GZIP -->1.0<!-- /AUTO --> KB
 *
 *   JS / CJS / MJS / CSS source code (block-comment form):
 *     see `MARKER_RE_JS` below for the literal pattern; it uses
 *     `/` + `*` block-comment delimiters around `AUTO:KEY` and
 *     `/AUTO`. The literal cannot be quoted inside this JSDoc
 *     comment because the closing delimiter would terminate the
 *     surrounding doc — see test fixtures for examples.
 *
 * Both syntaxes are matched by the same `injectMarkers()` call; the
 * result re-emits the original syntax (HTML markers stay HTML, JS
 * markers stay JS). Source files under `tests/` and `dist/` are
 * excluded from scanning so test fixtures (which legitimately embed
 * marker-shaped strings) and minified build artefacts are left alone.
 *
 * Edge case — same-syntax comment nesting:
 *   - Inside a JS block comment use the HTML-style marker (round 15
 *     edge case in `sw.js`'s PRECACHE block): the JS marker's `*` + `/`
 *     opening sequence would terminate the surrounding comment.
 *   - Inside an HTML comment use the JS-style marker (round 17 edge
 *     case in `index.html`'s preload comments): the HTML marker's
 *     `-->` close sequence would terminate the surrounding comment.
 *   The rule: pick the syntax that does NOT contain the close
 *   sequence of the wrapping comment. Both regexes run on every
 *   tracked file, so the file extension doesn't constrain which
 *   syntax appears where.
 *
 * The script is idempotent: running twice produces no diff.
 *
 * Available marker keys — see `computeMetrics()` below:
 *   - JS_RAW, JS_GZIP                          — dist/main.min.js sizes (KB)
 *   - CSS_DEFERRED_RAW, CSS_DEFERRED_GZIP      — dist/style-deferred.min.css
 *   - CSS_INLINE_RAW, CSS_INLINE_GZIP          — inline <style> in index.html
 *   - CSS_TOTAL_RAW, CSS_TOTAL_GZIP            — sum of the above two
 *   - TOTAL_RAW, TOTAL_GZIP                    — JS + CSS shipped total
 *   - BUDGET_JS_MAX, BUDGET_JS_WARN            — from scripts/performance-budget.js
 *   - BUDGET_CSS_MAX, BUDGET_CSS_WARN
 *   - BUDGET_TOTAL_MAX, BUDGET_TOTAL_WARN
 *   - CSS_VAR_COUNT                            — count of `--*` declarations in css/1-variables.css
 *   - LOC_HTML, LOC_JS_PROD, LOC_CSS           — line counts (production runtime + CSS modules)
 *   - ENGINE_NODE, ENGINE_NPM                  — engines from package.json (raw range, e.g. ">=24.0.0")
 *   - UNIT_TEST_COUNT, E2E_SPEC_COUNT          — static `test(`/`it(` count from tests/unit + tests/e2e (~N tests)
 *   - UNIT_SUITE_COUNT, E2E_SPEC_FILE_COUNT    — number of *.test.js / *.spec.js files
 *   - FONT_CINZEL_LCP_KB, FONT_CINZEL_400_KB,  — woff2 file sizes (KB) for the 5 deployed font subsets
 *     FONT_CINZEL_600_KB, FONT_CINZEL_700_KB,
 *     FONT_CRIMSON_ITALIC_KB
 *   - HERO_AVIF_KB, HERO_WEBP_KB              — ghironda-720.{avif,webp} sizes (KB) — referenced by sw.js PRECACHE comment
 *
 * Build integration: the script runs as the LAST step of `npm run build`,
 * after cache-bust and CSP regen, so the injected sizes reflect the
 * just-rebuilt dist/. CI then checks `git diff --exit-code` (in workflows
 * that gate on doc-vs-bundle drift) — any uncommitted marker change is a
 * doc that must be committed alongside the bundle change.
 *
 * Usage:
 *   node scripts/inject-doc-numbers.js          (writes updates in-place)
 *   node scripts/inject-doc-numbers.js --check  (exit 1 if any marker
 *                                                 needs updating; no writes)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { gzipBytes } from './lib/gzip-size.js';
import { findRepoRoot } from './lib/repo-root.js';

const ROOT = findRepoRoot();

const CHECK_ONLY = process.argv.includes('--check');

/** KB with one decimal — matches the manual style across the docs. */
function fmtKB(bytes) {
  return (bytes / 1024).toFixed(1);
}

function rawBytes(filePath) {
  return readFileSync(filePath).length;
}

function gzipFileBytes(filePath) {
  return gzipBytes(readFileSync(filePath));
}

function lineCount(filePath) {
  return readFileSync(filePath, 'utf8').split(/\r?\n/).length;
}

/**
 * Extract `js`, `css`, `total` budget values (max + warn) from
 * `scripts/performance-budget.js`. Single source of truth: when the
 * budget changes there, every doc with a `BUDGET_*` marker tracks
 * automatically.
 *
 * Parses by string-matching the literal `PERFORMANCE_BUDGET = { ... }`
 * declaration rather than `import()`-ing the script (that would
 * trigger its top-level side-effects: gzip + console output + exit).
 */
function readBudget() {
  const src = readFileSync(path.join(ROOT, 'scripts', 'performance-budget.js'), 'utf8');
  /* The block we're parsing looks like:
       const PERFORMANCE_BUDGET = {
         js: { max: 3, warn: 1.2 },
         css: { max: 7.5, warn: 7.15 },
         total: { max: 10, warn: 8.2 },
       };
     We tolerate a trailing comma, decimals, and arbitrary whitespace. */
  function pick(category) {
    const re = new RegExp(
      `${category}\\s*:\\s*\\{\\s*max:\\s*([0-9.]+)\\s*,\\s*warn:\\s*([0-9.]+)`,
      'm',
    );
    const m = src.match(re);
    if (!m) {
      throw new Error(
        `inject-doc-numbers: failed to parse '${category}' budget from scripts/performance-budget.js`,
      );
    }
    return { max: m[1], warn: m[2] };
  }
  return { js: pick('js'), css: pick('css'), total: pick('total') };
}

/**
 * Count CSS custom-property *declarations* (lines starting with `--`)
 * in css/1-variables.css. Some props get redeclared inside @media
 * blocks; for the README/ARCHITECTURE/CSS-ARCHITECTURE claim
 * "~N CSS Custom Properties" we want the unique-name count, not
 * the redeclaration count.
 */
function countCustomProperties() {
  const src = readFileSync(path.join(ROOT, 'css', '1-variables.css'), 'utf8');
  const matches = src.match(/--[a-zA-Z][a-zA-Z0-9-]*(?=\s*:)/g) || [];
  return new Set(matches).size;
}

/* Round-21 hardening: every git invocation goes through
   `execFileSync` with an argv array, NOT `execSync` with a
   shell-interpolated string. Author-controlled inputs only today
   — but the previous pattern made future callers a single typo
   away from a shell-injection footgun (e.g. `staticTestCount('tests/$(curl evil)/')`
   would have run the command). argv-style execution sidesteps the
   shell entirely. */
function gitLsFiles(...pathspecs) {
  return execFileSync('git', ['ls-files', ...pathspecs], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean);
}

/** Total LOC across all production CSS modules under css/. */
function cssLocTotal() {
  const files = gitLsFiles('css/').filter((f) => f.endsWith('.css'));
  let total = 0;
  for (const f of files) total += lineCount(path.join(ROOT, f));
  return total;
}

/** Total LOC across production runtime JS (js/**.js + sw.js). */
function jsLocTotal() {
  const files = gitLsFiles('js/', 'sw.js').filter((f) => f.endsWith('.js'));
  let total = 0;
  for (const f of files) total += lineCount(path.join(ROOT, f));
  return total;
}

/**
 * Static count of `test(...)` / `it(...)` invocations across the
 * spec files in `gitPathspec`. Includes `.skip`, `.only`,
 * `.concurrent` variants. Approximation of jest's runtime test
 * count (the runtime value can differ when parameterised tests
 * expand): a static count is "close enough" for an orientation
 * marker like "~N unit tests pass" and avoids invoking jest from
 * the build chain.
 */
function staticTestCount(gitPathspec) {
  const files = gitLsFiles(gitPathspec);
  const TEST_RE = /^\s*(?:test|it)(?:\.\w+)?\(/gm;
  let count = 0;
  for (const f of files) {
    const matches = readFileSync(path.join(ROOT, f), 'utf8').match(TEST_RE);
    count += matches ? matches.length : 0;
  }
  return count;
}

/** woff2 size in KB for a tracked font file. */
function fontKb(name) {
  const p = path.join(ROOT, 'fonts', name);
  return fmtKB(rawBytes(p));
}

/** size in KB for any tracked file under images/. */
function imgKb(name) {
  const p = path.join(ROOT, 'images', name);
  return fmtKB(rawBytes(p));
}

/** Count of *.test.js / *.spec.js files matching a git-pathspec. */
function specFileCount(gitPathspec, suffix) {
  return gitLsFiles(gitPathspec).filter((rel) => rel.endsWith(suffix)).length;
}

function computeMetrics() {
  /* Round 20 (option B): SIZE metrics are read from `.deploy/`, the
     build output. LOC_HTML is read from SOURCE `index.html` because
     that's the human-maintained file the docs are describing — the
     deploy copy is post-strip and would reflect strip aggressiveness
     instead of authored complexity. (Source has every descriptive
     comment + AUTO marker; strip removes them in `.deploy/`.) */
  const distJs = path.join(ROOT, '.deploy', 'dist', 'main.min.js');
  const distCssDeferred = path.join(ROOT, '.deploy', 'dist', 'style-deferred.min.css');
  const deployHtml = path.join(ROOT, '.deploy', 'index.html');
  const sourceHtml = path.join(ROOT, 'index.html');

  /* Inline <style> raw bytes — read from .deploy/index.html so the
     size marker reflects what actually ships (cache-bust + CSP run
     before docs:numbers). Source has empty CSS:BEGIN/END
     placeholders → would report 0 bytes inline. */
  const html = readFileSync(deployHtml, 'utf8');
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) {
    throw new Error('inject-doc-numbers: inline <style> block not found in .deploy/index.html');
  }
  const cssInline = Buffer.from(styleMatch[1], 'utf8');
  const cssInlineRaw = cssInline.length;
  const cssInlineGzip = gzipBytes(cssInline);

  /* Bundle sizes — these are the highest-frequency drifters in the
     prose docs (every refactor changes them by some KB). */
  const jsRaw = rawBytes(distJs);
  const jsGzip = gzipFileBytes(distJs);
  const cssDefRaw = rawBytes(distCssDeferred);
  const cssDefGzip = gzipFileBytes(distCssDeferred);

  const cssTotalRaw = cssInlineRaw + cssDefRaw;
  const cssTotalGzip = cssInlineGzip + cssDefGzip;
  const totalRaw = jsRaw + cssTotalRaw;
  const totalGzip = jsGzip + cssTotalGzip;

  const budget = readBudget();

  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  return {
    JS_RAW: fmtKB(jsRaw),
    JS_GZIP: fmtKB(jsGzip),
    CSS_DEFERRED_RAW: fmtKB(cssDefRaw),
    CSS_DEFERRED_GZIP: fmtKB(cssDefGzip),
    CSS_INLINE_RAW: fmtKB(cssInlineRaw),
    CSS_INLINE_GZIP: fmtKB(cssInlineGzip),
    CSS_TOTAL_RAW: fmtKB(cssTotalRaw),
    CSS_TOTAL_GZIP: fmtKB(cssTotalGzip),
    TOTAL_RAW: fmtKB(totalRaw),
    TOTAL_GZIP: fmtKB(totalGzip),
    BUDGET_JS_MAX: budget.js.max,
    BUDGET_JS_WARN: budget.js.warn,
    BUDGET_CSS_MAX: budget.css.max,
    BUDGET_CSS_WARN: budget.css.warn,
    BUDGET_TOTAL_MAX: budget.total.max,
    BUDGET_TOTAL_WARN: budget.total.warn,
    CSS_VAR_COUNT: String(countCustomProperties()),
    LOC_HTML: String(lineCount(sourceHtml)),
    LOC_JS_PROD: String(jsLocTotal()),
    LOC_CSS: String(cssLocTotal()),
    ENGINE_NODE: pkg.engines.node,
    ENGINE_NPM: pkg.engines.npm,
    UNIT_TEST_COUNT: String(staticTestCount('tests/unit/')),
    E2E_SPEC_COUNT: String(staticTestCount('tests/e2e/')),
    UNIT_SUITE_COUNT: String(specFileCount('tests/unit/', '.test.js')),
    E2E_SPEC_FILE_COUNT: String(specFileCount('tests/e2e/', '.spec.js')),
    FONT_CINZEL_LCP_KB: fontKb('cinzel-700-lcp.woff2'),
    FONT_CINZEL_400_KB: fontKb('cinzel-400.woff2'),
    FONT_CINZEL_600_KB: fontKb('cinzel-600.woff2'),
    FONT_CINZEL_700_KB: fontKb('cinzel-700.woff2'),
    FONT_CRIMSON_ITALIC_KB: fontKb('crimson-text-400-italic.woff2'),
    HERO_AVIF_KB: imgKb('ghironda-720.avif'),
    HERO_WEBP_KB: imgKb('ghironda-720.webp'),
  };
}

/* Public marker regexes — exposed for the file walker AND the unit
   tests. Each syntax is a separate regex so the consumer can match
   one or the other, and so injectMarkers can re-emit the same
   syntax it found. */
export const MARKER_RE_HTML = /<!-- AUTO:([A-Z_]+) -->(.*?)<!-- \/AUTO -->/gs;
export const MARKER_RE_JS = /\/\* AUTO:([A-Z_]+) \*\/(.*?)\/\* \/AUTO \*\//gs;

/* Back-compat alias — the original `MARKER_RE` was HTML-only and
   tests reference it under that name. Keeping the alias avoids
   touching pre-Round-15 tests that pin its shape. */
export const MARKER_RE = MARKER_RE_HTML;

/**
 * Replace every AUTO marker in `content` with the value from
 * `metrics`. Both syntaxes are processed:
 *   - HTML/Markdown form: `<!-- AUTO:KEY -->X<!-- /AUTO -->`
 *   - JS/CSS source form: `/* AUTO:KEY *\/X/* /AUTO *\/`
 * Each marker re-emits in its original syntax. Returns the new
 * content + the count of markers that actually changed value + the
 * list of unknown keys (markers whose KEY isn't defined in `metrics`).
 *
 * Pure: no I/O, no globals — exposed for unit testing.
 */
export function injectMarkers(content, metrics) {
  let changed = 0;
  const unknown = [];

  let updated = content.replaceAll(MARKER_RE_HTML, (match, key, oldValue) => {
    if (!(key in metrics)) {
      unknown.push(key);
      return match;
    }
    const newValue = metrics[key];
    if (newValue !== oldValue) changed++;
    return `<!-- AUTO:${key} -->${newValue}<!-- /AUTO -->`;
  });

  updated = updated.replaceAll(MARKER_RE_JS, (match, key, oldValue) => {
    if (!(key in metrics)) {
      unknown.push(key);
      return match;
    }
    const newValue = metrics[key];
    if (newValue !== oldValue) changed++;
    return `/* AUTO:${key} */${newValue}/* /AUTO */`;
  });

  return { updated, changed, unknown };
}

/**
 * Files excluded from marker injection by exact path — same policy
 * as docs-lint: CHANGELOG is canonical history (and may legitimately
 * quote example markers as prose); package-lock.json is
 * machine-generated and wouldn't have markers anyway.
 */
const EXCLUDE = new Set([
  'CHANGELOG.md',
  'package-lock.json',
  // Self-exclusion: this script's own docstring legitimately quotes
  // both marker syntax forms as documentation. Scanning ourselves
  // would either try to inject values into those examples (turning
  // the doc into a circular self-reference) or surface them as
  // "unknown marker keys" (since the example placeholders KEY / K
  // are not real metrics).
  'scripts/inject-doc-numbers.js',
]);

/**
 * Path-prefix exclusions — directories whose files must never be
 * scanned for markers. Two reasons:
 *   - `tests/` legitimately embeds marker-shaped strings as test
 *     fixtures (e.g. `expect(injectMarkers('<!-- AUTO:K -->x<!-- /AUTO -->'))`).
 *     If the injector touched those, the tests would mutate
 *     themselves.
 *   - `dist/` holds minified build output. Markers don't survive
 *     minification, so scanning would either produce no-ops or
 *     break the build artefact.
 */
const EXCLUDE_PREFIX = ['tests/', 'dist/'];

function discoverTargetFiles() {
  return (
    gitLsFiles()
      /* Discovery scope:
        - .md / .json / .html → HTML-style markers (`<!-- AUTO:... -->`)
        - .js / .cjs / .mjs / .css → JS-style block-comment markers
       injectMarkers handles both via two regex passes; file extension
       drives only the discovery scope, not the substitution path.
       index.html is scanned for HTML-comment markers in its <!-- ... -->
       blocks; the cache-bust hash and CSP hash are managed by separate
       scripts that target distinct patterns, so they don't collide. */
      .filter((rel) => /\.(md|json|cjs|mjs|js|css|html)$/.test(rel))
      .filter((rel) => !EXCLUDE.has(rel))
      .filter((rel) => !EXCLUDE_PREFIX.some((p) => rel.startsWith(p)))
  );
}

function processFiles(files, metrics) {
  let totalChanged = 0;
  const reports = [];
  const unknownKeys = new Set();
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    const content = readFileSync(abs, 'utf8');
    /* Round-23 fix: the fast-skip used to test only `<!-- AUTO:`,
       which silently passed over files that carry ONLY block-comment
       markers (`/* AUTO:KEY *\/`) — e.g. `scripts/performance-budget.js`,
       whose JS-comment-embedded budget table then drifted unnoticed
       because `--check` never inspected it. The unprefixed token is
       common to both syntaxes. */
    if (!content.includes('AUTO:')) continue; // fast skip
    const { updated, changed, unknown } = injectMarkers(content, metrics);
    for (const k of unknown) unknownKeys.add(k);
    if (changed > 0) {
      reports.push({ rel, changed });
      if (!CHECK_ONLY) writeFileSync(abs, updated);
      totalChanged += changed;
    }
  }
  return { reports, totalChanged, unknownKeys };
}

/* Scan every discovered file for `<!-- AUTO:KEY -->` and `/* AUTO:KEY *\/`
   marker openings and return the set of KEY tokens actually referenced
   anywhere in the tracked tree. Used after the injection pass to flag
   metric keys computed by `computeMetrics()` but never consumed by any
   doc — those silently accumulate as the codebase evolves and are
   the inverse failure mode of `unknownKeys`. */
function collectReferencedKeys(files) {
  const referenced = new Set();
  const HTML_OPEN = /<!--\s*AUTO:([A-Z0-9_]+)\s*-->/g;
  const JS_OPEN = /\/\*\s*AUTO:([A-Z0-9_]+)\s*\*\//g;
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    const content = readFileSync(abs, 'utf8');
    for (const m of content.matchAll(HTML_OPEN)) referenced.add(m[1]);
    for (const m of content.matchAll(JS_OPEN)) referenced.add(m[1]);
  }
  return referenced;
}

function main() {
  const metrics = computeMetrics();
  const files = discoverTargetFiles();
  const { reports, totalChanged, unknownKeys } = processFiles(files, metrics);

  /* Stale-metric guard (round 23): warn — but don't fail — when
     computeMetrics() exposes a key that no doc currently references.
     Failing here would block every legitimate refactor that
     temporarily orphans a metric; warning surfaces the drift and
     leaves the cleanup decision to the author. */
  const referenced = collectReferencedKeys(files);
  const orphaned = Object.keys(metrics).filter((k) => !referenced.has(k));
  if (orphaned.length > 0) {
    console.warn(
      `⚠️  inject-doc-numbers: ${orphaned.length} metric key(s) computed but unreferenced: ${orphaned.join(', ')}\n` +
        `   Either add a marker for each in a tracked doc, or prune the entry from computeMetrics().`,
    );
  }

  if (unknownKeys.size > 0) {
    console.error(
      `❌ inject-doc-numbers: unknown marker key(s): ${[...unknownKeys].join(', ')}\n` +
        `Add them to computeMetrics() in scripts/inject-doc-numbers.js or remove the markers.`,
    );
    process.exit(1);
  }

  if (CHECK_ONLY) {
    if (totalChanged > 0) {
      console.error(`❌ inject-doc-numbers --check: ${totalChanged} marker(s) out of date:`);
      for (const { rel, changed } of reports) {
        console.error(`  ${rel}: ${changed} stale marker(s)`);
      }
      console.error(`Run \`npm run docs:numbers\` to refresh.`);
      process.exit(1);
    }
    console.log(`✅ inject-doc-numbers --check: every marker is current.`);
    return;
  }

  if (totalChanged === 0) {
    console.log(
      `✅ inject-doc-numbers: ${files.length} files scanned; every marker already current.`,
    );
    return;
  }

  console.log(`✏️  inject-doc-numbers: refreshed ${totalChanged} marker(s):`);
  for (const { rel, changed } of reports) {
    console.log(`  ${rel}: ${changed} marker(s) updated`);
  }
}

/* CLI entry point — same `process.argv[1]` basename guard as
   docs-lint.js so this file is safe to import from unit tests. */
/* istanbul ignore next -- CLI entry; exercised in CI by `npm run docs:numbers`, not under jest */
if (
  process.argv[1] &&
  process.argv[1].replaceAll('\\', '/').endsWith('/scripts/inject-doc-numbers.js')
) {
  main();
}
