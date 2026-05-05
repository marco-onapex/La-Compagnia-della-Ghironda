#!/usr/bin/env node
/**
 * Documentation + config + asset-reference linter — fails the build
 * when stale references creep into Markdown docs, machine-readable
 * config files, or HTML/manifest asset URLs.
 *
 * Catches three classes of drift observed during the Apr 2026 audits:
 *
 *  1. Doc/config drift — refactors that removed code/files but left
 *     their names quoted in ARCHITECTURE / TESTING / README / etc.,
 *     or in config-file comment fields (e.g. stryker.conf.json's
 *     `_comment_mutate` claiming istanbul-ignored branches that had
 *     since been removed; jest.config.cjs claiming "no remaining
 *     'untestable in jsdom' code" while logger.js still carried 3
 *     ignore annotations). → handled by FORBIDDEN_REFERENCES /
 *     FORBIDDEN_PROSE pattern matching.
 *
 *  2. npm script drift — markdown that documents a command like
 *     `npm run test:a11y:axe` that does not exist in package.json
 *     (the actual script was renamed to `test:accessibility`). →
 *     handled by checkNpmScriptValidity().
 *
 *  3. Asset reference drift — HTML / manifest that points at a path
 *     no longer tracked by git: e.g. og:image, twitter:image,
 *     Schema.org Organization.logo all referencing
 *     `images/ghironda.png` after that file became gitignored.
 *     Social-media crawlers, Google Knowledge Panel, and PWA install
 *     dialogs all 404'd. → handled by checkAssetReferences().
 *
 * Files scanned by the regex layer:
 *   - All tracked `*.md` (FORBIDDEN_REFERENCES + FORBIDDEN_PROSE)
 *   - All tracked `*.json`, `*.cjs`, `*.mjs` at the repo root and
 *     inside `scripts/` (FORBIDDEN_REFERENCES only — keeps the
 *     false-positive surface low while catching the Apr 2026
 *     config-comment drift).
 *
 * Files scanned by the integrity layer:
 *   - `index.html` — every same-origin asset URL in <meta>, <link>,
 *     <script>, <img>, <source>, and Schema.org JSON-LD.
 *   - `manifest.webmanifest` — every `icons[].src`.
 *   - All tracked `*.md` — every `npm run X` token.
 *
 * To extend the regex layer: add an entry to FORBIDDEN_REFERENCES
 * (or FORBIDDEN_PROSE) with a regex that uniquely identifies the
 * stale reference + a short reason describing the rename / removal
 * so the next maintainer knows why the rule exists.
 *
 * Usage:
 *   node scripts/docs-lint.js
 *   npm run lint:docs
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { findRepoRoot } from './lib/repo-root.js';

/* ROOT discovery — see scripts/lib/repo-root.js for the rationale on
   why this walks up from `process.cwd()` instead of using
   `fileURLToPath(import.meta.url)` (the latter breaks under
   babel-jest's CJS transform). */
const ROOT = findRepoRoot();

/* ─────────────────────────────────────────────────────────────────────
   PURE HELPERS — exported for unit testing.
   These functions have no side effects (no I/O, no globals); the
   I/O-bound `main()` and discovery helpers below compose them.
   tests/unit/docs-lint.test.js exercises every branch directly.
   ───────────────────────────────────────────────────────────────────── */

export const SITE_BASE = 'https://marco-onapex.github.io/La-Compagnia-della-Ghironda/';

/**
 * Normalise a URL to a repo-relative tracked path, or null if the URL
 * is external / data: / fragment-only / mailto: (cases that cannot or
 * should not be verified statically).
 *
 * @param {string} url - the URL or path to normalise.
 * @param {string} [siteBase] - the canonical site URL prefix. Defaults
 *   to SITE_BASE so most callers omit it; tests pass an explicit value
 *   to verify the prefix-strip branch independently.
 * @returns {string|null} the repo-relative path, or null when the URL
 *   is external / un-checkable.
 */
export function pathFromUrl(url, siteBase = SITE_BASE) {
  if (!url) return null;
  if (url.startsWith('data:') || url.startsWith('mailto:') || url.startsWith('tel:')) return null;
  if (url.startsWith('#')) return null;
  if (url.startsWith(siteBase)) return url.slice(siteBase.length).split(/[?#]/)[0];
  if (/^https?:\/\//.test(url) || url.startsWith('//')) return null; // external
  /* Site-relative or repo-relative — strip query/hash and any leading
     slash so the result keys into `git ls-files` output. */
  return url.split(/[?#]/)[0].replace(/^\/+/, '');
}

/** Convert a byte offset into a 1-based line number. */
export function lineNumOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

/**
 * Extract every `npm run <script>` token reference from a Markdown
 * (or any text) string. Returns an array of { line, text, script }
 * with 1-based line numbers.
 */
export function findNpmScriptReferences(content) {
  /* The regex captures the script name greedily (`[a-zA-Z0-9:_-]+`)
     so "npm run test:e2e -- --debug" matches `test:e2e` cleanly. */
  const NPM_RUN_RE = /\bnpm\s+run\s+([a-zA-Z][a-zA-Z0-9:_-]*)/g;
  const refs = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    /* Each `.exec()` advances `lastIndex`, but resetting between lines
       is unnecessary because the regex is anchored to a fresh string
       per iteration. The internal `g` flag is required for the
       `while ((m = re.exec(...)))` pattern to advance through multiple
       matches on the same line. */
    NPM_RUN_RE.lastIndex = 0;
    while ((m = NPM_RUN_RE.exec(line)) !== null) {
      refs.push({ line: i + 1, text: line.trim(), script: m[1] });
    }
  }
  return refs;
}

/**
 * Extract every same-origin asset URL reference from an index.html
 * payload. Covers the meta tags, link/script/img/source, AND
 * Schema.org JSON-LD logo/image fields. Returns an array of
 * { label, url, lineNum }.
 */
export function extractHtmlAssetUrls(html) {
  /* Each pattern captures one URL per match; line numbers are
     computed from the byte offset so multi-line srcsets resolve to
     the line where the attribute opens. */
  const HTML_PATTERNS = [
    { label: 'og:image', re: /<meta\s+property="og:image"\s+content="([^"]+)"/g },
    { label: 'twitter:image', re: /<meta\s+name="twitter:image"\s+content="([^"]+)"/g },
    { label: '<link href>', re: /<link\b[^>]*\shref="([^"]+)"/g },
    { label: '<script src>', re: /<script\b[^>]*\ssrc="([^"]+)"/g },
    { label: '<img src>', re: /<img\b[^>]*\ssrc="([^"]+)"/g },
  ];
  const refs = [];
  for (const { label, re } of HTML_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
      refs.push({ label, url: m[1], lineNum: lineNumOf(html, m.index) });
    }
  }
  /* <source srcset="url1 280w, url2 420w, …"> → split, validate each. */
  const SRCSET_RE = /<source\b[^>]*\ssrcset="([^"]+)"/g;
  SRCSET_RE.lastIndex = 0;
  let sm;
  while ((sm = SRCSET_RE.exec(html)) !== null) {
    const lineNum = lineNumOf(html, sm.index);
    const urls = sm[1]
      .split(',')
      .map((s) => s.trim().split(/\s+/)[0])
      .filter(Boolean);
    for (const u of urls) refs.push({ label: '<source srcset>', url: u, lineNum });
  }
  /* Schema.org JSON-LD — verify every "logo" / "image" URL inside
     <script type="application/ld+json">. */
  const LD_RE = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  LD_RE.lastIndex = 0;
  let ld;
  while ((ld = LD_RE.exec(html)) !== null) {
    const blockStart = ld.index;
    const blockBody = ld[1];
    const bodyOffset = ld[0].indexOf(blockBody);
    const KEYS = ['logo', 'image'];
    for (const k of KEYS) {
      const re = new RegExp(`"${k}"\\s*:\\s*"([^"]+)"`, 'g');
      let mm;
      while ((mm = re.exec(blockBody)) !== null) {
        const offset = blockStart + bodyOffset + mm.index;
        refs.push({ label: `schema.org "${k}"`, url: mm[1], lineNum: lineNumOf(html, offset) });
      }
    }
  }
  /* Inline <style> blocks — every CSS `url(...)` resolves against the
     HTML's directory (repo root, since the build inlines CSS into
     index.html). The CSS-only @font-face / background-image refs that
     would otherwise be invisible to the integrity layer come through
     here. data:/external are filtered by `resolveCssUrl` later.

     The label embeds the ORIGINAL `url(...)` payload so violation
     diagnostics show what the maintainer wrote, not the resolved
     path; `url` is set to the resolved path because that's what
     `validateAssetReferences` keys against tracked-files. */
  const STYLE_RE = /<style[^>]*>([\s\S]*?)<\/style>/g;
  STYLE_RE.lastIndex = 0;
  let st;
  while ((st = STYLE_RE.exec(html)) !== null) {
    const blockStart = st.index;
    const blockBody = st[1];
    const bodyOffset = st[0].indexOf(blockBody);
    for (const { url: original, offset } of extractCssUrlReferences(blockBody)) {
      const resolved = resolveCssUrl(original, '');
      if (resolved === null) continue;
      const absOffset = blockStart + bodyOffset + offset;
      refs.push({
        label: `inline <style> url(${original})`,
        url: resolved,
        lineNum: lineNumOf(html, absOffset),
      });
    }
  }
  return refs;
}

/**
 * Extract icon `src` references from a manifest.webmanifest payload.
 * Returns an array of { label, url, lineNum }. lineNum is approximate
 * (we look up the literal value in the raw text); when the value
 * appears multiple times or whitespace differs the line falls back to 0.
 */
export function extractManifestIconSrcs(manifestRaw) {
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    /* JSON parse error is a different kind of issue; htmlhint / tsc /
       native JSON parsers catch it elsewhere. */
    return [];
  }
  if (!manifest || !Array.isArray(manifest.icons)) return [];
  const lines = manifestRaw.split(/\r?\n/);
  const refs = [];
  for (const icon of manifest.icons) {
    if (!icon || typeof icon.src !== 'string') continue;
    const lineNum = lines.findIndex((l) => l.includes(`"${icon.src}"`)) + 1 || 0;
    refs.push({ label: 'icons[].src', url: icon.src, lineNum });
  }
  return refs;
}

/**
 * Extract every `url(...)` reference from a CSS payload. Returns an
 * array of `{ url, offset }` where `offset` is the byte index of the
 * match in the input — callers compose with `lineNumOf` to convert to
 * a line number when needed. Pure: no resolution, no I/O.
 *
 * The regex matches the three CSS Values & Units `<url>` forms,
 * each in its own alternation branch so the body can contain the
 * OPPOSITE quote character without breaking the match:
 *   1. `url("...")`   — body excludes only `"`. Handles single quotes
 *                       and parens inside (e.g. SVG xlink="url(#id)").
 *   2. `url('...')`   — body excludes only `'`. Handles double quotes
 *                       inside (the dominant case for inlined data: SVG
 *                       URLs whose `xmlns="..."` attribute uses double
 *                       quotes).
 *   3. `url(x)`       — unquoted; first char is non-quote, body extends
 *                       non-greedily to the next `)`. Per CSS spec,
 *                       unquoted URLs cannot contain whitespace, parens,
 *                       or quotes.
 * Capture groups 1, 2, 3 correspond to the three branches; the loop
 * picks whichever fired.
 *
 * `data:` URLs are kept in the result so callers can opt in / out;
 * `resolveCssUrl` is the gatekeeper that filters non-asset schemes.
 *
 * Round-5 follow-up: the previous regex `\burl\(\s*["']?([^"')]+)["']?\s*\)`
 * silently failed on real-world data: URLs whose body contained the
 * opposite quote char (e.g. `url('data:image/svg+xml,<svg xmlns="..."/>')`)
 * because `[^"')]` excluded BOTH quote chars. Production behaviour
 * was correct by accident (data: URLs would be filtered by
 * `resolveCssUrl` anyway), but the doc and the test fixture were
 * misleading. The tri-form regex matches reality.
 */
export function extractCssUrlReferences(css) {
  const URL_RE = /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^"'\s)][^)]*?))\s*\)/g;
  URL_RE.lastIndex = 0;
  const refs = [];
  let m;
  while ((m = URL_RE.exec(css)) !== null) {
    /* m[1] = double-quoted body, m[2] = single-quoted, m[3] = unquoted.
       Exactly one is defined per match. */
    const url = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (url) refs.push({ url, offset: m.index });
  }
  return refs;
}

/**
 * Resolve a CSS `url(...)` payload to a repo-relative tracked path
 * (or null if the URL is data:/external). The base directory is the
 * directory containing the CSS file (or the directory where the CSS
 * is "inlined into", in the case of inline `<style>`).
 *
 * Examples:
 *   resolveCssUrl('fonts/cinzel-400.woff2', '')           → 'fonts/cinzel-400.woff2'
 *   resolveCssUrl('../fonts/cinzel-600.woff2', 'dist')    → 'fonts/cinzel-600.woff2'
 *   resolveCssUrl('data:image/svg+xml,...', 'dist')       → null
 *   resolveCssUrl('https://example.com/x.woff2', 'dist')  → null
 */
export function resolveCssUrl(url, baseDir) {
  if (!url) return null;
  if (url.startsWith('data:')) return null;
  if (/^https?:\/\//.test(url) || url.startsWith('//')) return null;
  /* Fragment-only references — `url(#filter-id)`, `url(#clip-id)`,
     and the URL-encoded form `url(%23xxx)` that the build's CSS
     minifier emits when a fragment-id appears INSIDE a data: URL's
     SVG body (e.g. `<rect fill="url(%23gipsy)"/>` inside an inline
     SVG pattern definition). These are intra-document references,
     not external assets — never validated against tracked files. */
  if (url.startsWith('#') || url.startsWith('%23')) return null;
  /* Use POSIX path math regardless of host OS — git ls-files emits
     POSIX paths and that's what we key against. */
  const base = (baseDir || '').replaceAll('\\', '/');
  const stripped = url.split(/[?#]/)[0];
  const joined = base ? `${base.replace(/\/$/, '')}/${stripped}` : stripped;
  return path.posix.normalize(joined).replace(/^\/+/, '');
}

/**
 * Apply a list of regex patterns to text content, returning the
 * matched lines as violations. Pure — used by both the markdown and
 * config-file passes.
 */
export function lintContent(content, patterns) {
  const lines = content.split(/\r?\n/);
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, reason } of patterns) {
      if (pattern.test(line)) {
        violations.push({ line: i + 1, text: line.trim(), reason });
      }
    }
  }
  return violations;
}

/**
 * Universal forbidden patterns — applied to BOTH Markdown and config
 * files. These regexes match path/symbol references that should not
 * exist anywhere in the repo (the underlying file/function/script was
 * removed). Word-boundary anchors (`\b`) keep them from false-positive-
 * matching unrelated identifiers.
 *
 * Each entry is one regression we have already fixed once and don't
 * want to see again.
 *
 * @type {Array<{ pattern: RegExp, reason: string }>}
 */
export const FORBIDDEN_REFERENCES = [
  {
    pattern: /\bjs\/config\.js\b/,
    reason:
      'js/config.js was removed in the Apr 2026 Level B refactor; runtime constants now live inline or in CSS tokens.',
  },
  {
    pattern: /\bjs\/modules\/observer\.js\b/,
    reason: 'js/modules/observer.js was removed; section nav highlight is pure CSS view-timeline.',
  },
  {
    pattern: /\bjs\/modules\/polyfills\.js\b/,
    reason: 'js/modules/polyfills.js was removed (IE11 dropped, browser floor raised).',
  },
  {
    pattern: /\bsetupObserver\b/,
    reason: 'setupObserver was an observer.js export; the module is gone.',
  },
  {
    pattern: /\bsetupHeaderHeight\b/,
    reason: 'setupHeaderHeight was replaced by static --header-h + :has() expansion.',
  },
  {
    pattern: /\bsetupHeaderToggle\b/,
    reason: 'setupHeaderToggle replaced by CSS scroll-driven view-timeline on body.',
  },
  {
    pattern: /\bsetupNavToggle\b/,
    reason: 'setupNavToggle replaced by checkbox-hack with :has().',
  },
  {
    pattern: /\bconfig-sync\.test\.js\b/,
    reason: 'config-sync.test.js was removed alongside js/config.js.',
  },
  {
    pattern: /\bobserver\.test\.js\b/,
    reason: 'observer.test.js was removed alongside js/modules/observer.js.',
  },
  {
    pattern: /\bpolyfills\.test\.js\b/,
    reason: 'polyfills.test.js was removed alongside js/modules/polyfills.js.',
  },
  {
    /* `scripts/subset-fonts.js` (Latin-Ext-A subset pipeline) was
       deleted because running it overwrote the text-targeted woff2
       with the bigger Latin-Ext-A subset, silently regressing every
       page-load. The text-targeted `scripts/subset-fonts-page.js`
       is the canonical pipeline now. */
    pattern: /\bsubset-fonts\.js\b|\bbuild:fonts:subset\b/,
    reason:
      'scripts/subset-fonts.js + the build:fonts:subset npm script were removed (Apr 2026) because they overwrote text-targeted woff2 with a generic Latin-Ext-A subset. Use `scripts/subset-fonts-page.js` / `npm run build:fonts:page` instead.',
  },
];

/**
 * Markdown-only forbidden patterns — natural-language assertions that
 * only make sense in prose. Applying them to config files would risk
 * false-positive matches against unrelated identifier substrings.
 *
 * @type {Array<{ pattern: RegExp, reason: string }>}
 */
export const FORBIDDEN_PROSE = [
  {
    /* Match POSITIVE assertions that JS sets/manipulates aria-current.
       Form: "JS [verb] aria-current" or "[verb] aria-current via/by JS".
       Does NOT match negative forms like "aria-current is no longer set
       by JS" because subject-verb-object order is reversed there. */
    pattern:
      /\b(?:JS\s+(?:dynamically\s+)?(?:sets|writes|toggles|manages|updates|reflects)\s+(?:the\s+)?aria-current|aria-current\s+is\s+(?:set|written|managed|toggled|updated|reflected)\s+(?:dynamically\s+)?via\s+JS)\b/i,
    reason:
      'JS no longer writes aria-current; section indicator is pure CSS view-timeline. Document as a trade-off (e.g. "is no longer set"), not as current behaviour.',
  },
  {
    /* Same logic for .nav-open: only match positive claims that JS
       toggles/sets the class. Documentation noting "the .nav-open class
       hook was replaced" is permitted. */
    pattern:
      /\bJS\s+(?:dynamically\s+)?(?:toggles|sets|writes|adds|removes)\s+(?:the\s+)?\.?nav-open\b/i,
    reason: '.nav-open class hook was replaced by :has(.nav-toggle-input:checked).',
  },
  {
    /* sw.js no longer uses setTimeout+clearTimeout for abort handling —
       it switched to AbortSignal.timeout(). A doc claiming the SW
       schedules a manual setTimeout abort is stale. */
    pattern:
      /\bSW\b[^.]*\bsetTimeout[^.]*\bcontroller\.abort\b|\bclearTimeout\(timer\)\b[^.]*\bSW\b/i,
    reason:
      'sw.js replaced manual setTimeout/clearTimeout with AbortSignal.timeout() in Apr 2026; docs should reference the new API.',
  },
  {
    /* The previous test pattern `new Function(SW_SOURCE)(...)` was
       replaced by `jest.isolateModules + require()` when sw.js was
       refactored to dual-mode CJS. Docs that still describe the old
       eval-based test pattern are stale. */
    pattern: /\bnew\s+Function\s*\(\s*SW_SOURCE\b/i,
    reason:
      'sw.test.js no longer uses `new Function(SW_SOURCE)` — it `require()`s sw.js via jest.isolateModules now.',
  },
  {
    /* AbortController was removed from sw.js's setup() destructure
       when AbortSignal.timeout() replaced the manual abort pair.
       Docs that list AbortController as a SW dependency are stale. */
    pattern:
      /\bsw\.js[^.]*\b(?:depends on|takes|uses|injects)\s+AbortController\b|\bsetup\([^)]*AbortController\b/i,
    reason:
      'sw.js no longer uses AbortController directly — AbortSignal.timeout() returns a self-managed signal.',
  },
  {
    /* The `babel-plugin-istanbul` manual instrumentation in sw.test.js
       was removed when sw.js became require()-able. Docs that
       reference this hack are stale. */
    pattern: /\bbabel-plugin-istanbul\b[^.]*\b(?:sw\.js|sw\.test\.js|service worker)\b/i,
    reason:
      'sw.test.js no longer needs babel-plugin-istanbul as a manual instrumenter — Jest transforms sw.js via the standard pipeline.',
  },
  {
    /* Apr 2026 follow-up: js/main.js had its istanbul-ignore annotations
       removed and is now exercised by tests/unit/main.test.js. Any doc
       claim that main.js is "untestable in jsdom" or excluded from
       coverage/mutation is stale. */
    pattern:
      /\b(?:js\/)?main\.js\b[^.\n]*\b(?:istanbul[- ]ignore|untestable\s+in\s+jsdom|excluded\s+from\s+(?:coverage|mutation))\b/i,
    reason:
      'js/main.js no longer carries istanbul-ignore annotations and is no longer excluded from Stryker — its branches are exercised by tests/unit/main.test.js (Apr 2026 follow-up).',
  },
];

/* Files that legitimately mention removed entities (e.g. CHANGELOG
   documents what was removed and why). Exclude them from linting. */
const EXCLUDE = new Set(['CHANGELOG.md']);

/* ─────────────────────────────────────────────────────────────────────
   I/O CONTRACT — every I/O wrapper below accepts an `io` object with
   `gitLsFiles`, `readFile`, `fileExists`, `root`. The default
   implementation runs against the live filesystem; unit tests pass
   in-memory mocks and assert behaviour without touching `node:fs` or
   spawning `git`. This DI seam closes the coverage asymmetry where
   the pure helpers were 100 % tested but the file-glue wrappers were
   integration-tested only via `npm run lint:docs`.
   ───────────────────────────────────────────────────────────────────── */

/**
 * @typedef {object} DocsLintIO
 * @property {(patterns?: string[]) => string} gitLsFiles - Run `git ls-files`
 *   with optional glob patterns. Returns raw stdout (newline-separated
 *   tracked paths). Empty / omitted patterns = all tracked files.
 * @property {(abs: string) => string} readFile - Read a file as UTF-8.
 * @property {(abs: string) => boolean} fileExists - Existence check.
 * @property {string} root - Repository root. Tests override to a tmpdir
 *   when exercising the wrappers in isolation.
 */

/** @type {DocsLintIO} */
export const defaultIO = {
  gitLsFiles(patterns = []) {
    const args = patterns.map((p) => `"${p}"`).join(' ');
    const cmd = patterns.length > 0 ? `git ls-files ${args}` : 'git ls-files';
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' });
  },
  readFile(abs) {
    return readFileSync(abs, 'utf8');
  },
  fileExists(abs) {
    return existsSync(abs);
  },
  root: ROOT,
};

/* Discover Markdown files via git so untracked drafts aren't flagged. */
export function discoverMarkdownFiles(io = defaultIO) {
  const out = io.gitLsFiles(['*.md']);
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((rel) => !EXCLUDE.has(rel))
    .map((rel) => ({ rel, abs: path.join(io.root, rel) }));
}

/* Discover machine-readable config files (root + scripts/) — kept
   tight on purpose: scanning every tracked .js file would conflate
   "stale documentation reference" with "broken require()" and would
   produce noisy false-positives in the test suite. The drift class
   we actually care about lives in package.json scripts, *.config.cjs,
   stryker.conf.json, tsconfig*.json, and similar. */
export function discoverConfigFiles(io = defaultIO) {
  const patterns = ['*.json', '*.cjs', '*.mjs', 'scripts/*.cjs', 'scripts/*.mjs'];
  const out = io.gitLsFiles(patterns);
  return (
    out
      .split(/\r?\n/)
      .filter(Boolean)
      /* package-lock.json is huge, machine-generated, and full of legitimate
       references to historic packages — skip to keep the scan fast and
       false-positive-free. */
      .filter((rel) => rel !== 'package-lock.json')
      .map((rel) => ({ rel, abs: path.join(io.root, rel) }))
  );
}

export function lintFile({ rel, abs }, patterns, io = defaultIO) {
  const content = io.readFile(abs);
  return lintContent(content, patterns).map((v) => ({ ...v, file: rel }));
}

/* ─────────────────────────────────────────────────────────────────────
   Integrity layer — additional checks beyond regex pattern matching.
   Each function returns an array of { file, line, text, reason }.
   ───────────────────────────────────────────────────────────────────── */

/**
 * Verify that every `npm run <script>` token in the markdown corpus
 * resolves to a script defined in package.json. Catches the
 * `npm run test:a11y:axe` class of drift where a doc keeps citing
 * a renamed/removed script.
 */
export function checkNpmScriptValidity(mdFiles, io = defaultIO) {
  const violations = [];
  const pkg = JSON.parse(io.readFile(path.join(io.root, 'package.json')));
  const validScripts = new Set(Object.keys(pkg.scripts || {}));

  for (const { rel, abs } of mdFiles) {
    const content = io.readFile(abs);
    const refs = findNpmScriptReferences(content);
    for (const { line, text, script } of refs) {
      if (!validScripts.has(script)) {
        violations.push({
          file: rel,
          line,
          text,
          reason: `\`npm run ${script}\` is referenced but not defined in package.json. Either add the script or update the doc to the canonical name.`,
        });
      }
    }
  }
  return violations;
}

/**
 * Verify that every same-origin asset URL in index.html and
 * manifest.webmanifest points at a tracked file. Catches the class
 * of drift where og:image, twitter:image, Schema.org Organization.logo,
 * <link rel="icon">, <img src>, etc. silently 404 because the
 * underlying file was gitignored, renamed, or removed.
 *
 * External URLs (https://...themiracleshard.com etc.) are skipped:
 * we cannot verify them statically, and the strict CSP plus
 * allowlist already prevents arbitrary external script/style/connect
 * sources at runtime.
 */
/**
 * Build-time-generated asset paths that are not tracked in git but are
 * produced by `npm run build` and shipped under `.deploy/`. Round-20
 * (option B) introduced the source/deploy split: `dist/` no longer
 * exists in source, so a literal `tracked-file` lookup for
 * `dist/main.min.js` would fail even though the deployed site has the
 * file. Listing them here keeps the asset-reference check honest:
 * source-tree references to a buildable path still pass, but a typo
 * that lands on `dist/main.mn.js` (or any other unknown path) still
 * fails. The list is intentionally tiny — extending it should require
 * a deliberate review.
 */
const BUILDABLE_ASSETS = new Set(['dist/main.min.js', 'dist/style-deferred.min.css']);

/**
 * Validate every asset reference (returned by extractHtmlAssetUrls /
 * extractManifestIconSrcs) against a set of tracked file paths.
 * Pure: takes refs + tracked-file set → returns violations.
 */
export function validateAssetReferences(file, refs, trackedFiles) {
  const violations = [];
  for (const { label, url, lineNum } of refs) {
    const p = pathFromUrl(url);
    if (!p) continue;
    if (trackedFiles.has(p)) continue;
    if (BUILDABLE_ASSETS.has(p)) continue;
    violations.push({
      file,
      line: lineNum,
      text: `${label} → ${url}`,
      reason: `Asset "${p}" is referenced but is NOT a tracked file in git (gitignored, renamed, or never committed). Social-media crawlers, search engines, and PWA installs will see a 404.`,
    });
  }
  return violations;
}

/**
 * Extract every `url(...)` reference from a CSS file's content,
 * resolving each against the file's directory and producing the same
 * `{ label, url, lineNum }` shape that `validateAssetReferences`
 * consumes. The label includes the source file so violation
 * diagnostics still tell the maintainer which CSS to edit.
 *
 * @param {string} css - Raw CSS source.
 * @param {string} relativeFilePath - The CSS file's path relative to
 *   the repo root (e.g. 'dist/style-deferred.min.css'). Drives the
 *   `url()` resolution base directory.
 */
export function extractCssFileAssetUrls(css, relativeFilePath) {
  const baseDir = path.posix.dirname(relativeFilePath.replaceAll('\\', '/'));
  const refs = [];
  for (const { url: original, offset } of extractCssUrlReferences(css)) {
    const resolved = resolveCssUrl(original, baseDir === '.' ? '' : baseDir);
    if (resolved === null) continue;
    /* Same labelling pattern as inline <style>: embed the original
       `url(...)` payload so the violation message tells the
       maintainer the literal text they wrote, while `url` carries
       the resolved path used for tracked-file lookup. */
    refs.push({
      label: `${relativeFilePath} url(${original})`,
      url: resolved,
      lineNum: lineNumOf(css, offset),
    });
  }
  return refs;
}

export function checkAssetReferences(io = defaultIO) {
  const trackedFiles = new Set(io.gitLsFiles().split(/\r?\n/).filter(Boolean));
  const violations = [];

  const htmlPath = path.join(io.root, 'index.html');
  if (io.fileExists(htmlPath)) {
    const html = io.readFile(htmlPath);
    violations.push(
      ...validateAssetReferences('index.html', extractHtmlAssetUrls(html), trackedFiles),
    );
  }

  const manifestPath = path.join(io.root, 'manifest.webmanifest');
  if (io.fileExists(manifestPath)) {
    const manifestRaw = io.readFile(manifestPath);
    violations.push(
      ...validateAssetReferences(
        'manifest.webmanifest',
        extractManifestIconSrcs(manifestRaw),
        trackedFiles,
      ),
    );
  }

  /* Deferred CSS bundle — any @font-face / background-image url()
     reference inside .deploy/dist/style-deferred.min.css must resolve
     to a tracked file. Catches the class of drift where a font is
     renamed/removed and only the deferred CSS keeps the stale path
     (the inline `<style>` is regenerated by build:css; the deferred
     bundle is regenerated too, but if the SOURCE CSS in css/ still
     references the wrong path, the bundle inherits it).
     Round 20 (option B): the bundle file lives at
     `.deploy/dist/style-deferred.min.css`, but its `url(../fonts/...)`
     references must resolve against the SHIPPED layout —
     `dist/style-deferred.min.css` → `fonts/`. We pass the
     deploy-relative pseudo-path so resolution lands on
     `fonts/cinzel-XXX.woff2` (which is the tracked source path). The
     check is best-effort — if the build hasn't run yet, the bundle is
     absent and we silently skip rather than failing. CI invokes
     docs-lint AFTER `npm run build`, so on the gating path the file
     is always present. */
  const deferredCssPath = path.join(io.root, '.deploy', 'dist', 'style-deferred.min.css');
  if (io.fileExists(deferredCssPath)) {
    const css = io.readFile(deferredCssPath);
    violations.push(
      ...validateAssetReferences(
        '.deploy/dist/style-deferred.min.css',
        extractCssFileAssetUrls(css, 'dist/style-deferred.min.css'),
        trackedFiles,
      ),
    );
  }

  return violations;
}

/**
 * Run the full lint pipeline. Returns the process exit code (0 = clean,
 * 1 = violations found) instead of calling `process.exit` directly,
 * which lets unit tests assert on the return value without having to
 * stub out the global. The CLI shim at the bottom of this file invokes
 * `process.exit(main())` so the contract from a shell perspective is
 * unchanged.
 *
 * @param {DocsLintIO} [io] - injected I/O dependencies (defaults to
 *   live filesystem + git).
 * @returns {0|1}
 */
export function main(io = defaultIO) {
  const mdFiles = discoverMarkdownFiles(io);
  const configFiles = discoverConfigFiles(io);

  /* Markdown gets BOTH lists; configs get only the universal list. */
  const mdPatterns = [...FORBIDDEN_REFERENCES, ...FORBIDDEN_PROSE];
  const configPatterns = FORBIDDEN_REFERENCES;

  const regexViolations = [
    ...mdFiles.flatMap((f) => lintFile(f, mdPatterns, io)),
    ...configFiles.flatMap((f) => lintFile(f, configPatterns, io)),
  ];
  const npmViolations = checkNpmScriptValidity(mdFiles, io);
  const assetViolations = checkAssetReferences(io);

  const allViolations = [...regexViolations, ...npmViolations, ...assetViolations];
  const totalScanned = mdFiles.length + configFiles.length;

  if (allViolations.length === 0) {
    console.log(
      `✅ docs-lint: ${mdFiles.length} Markdown + ${configFiles.length} config files clean; ` +
        `npm-script references valid; index.html + manifest + deferred-CSS asset URLs intact.`,
    );
    return 0;
  }

  console.error('❌ docs-lint: stale references found.\n');
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    > ${v.text}`);
    console.error(`    reason: ${v.reason}\n`);
  }
  console.error(
    `\nTotal: ${allViolations.length} violation(s) — ` +
      `${regexViolations.length} regex, ` +
      `${npmViolations.length} npm-script, ` +
      `${assetViolations.length} asset-reference. ` +
      `Scanned ${totalScanned} files (${mdFiles.length} md + ${configFiles.length} config) ` +
      `+ index.html + manifest.webmanifest.`,
  );
  return 1;
}

/* CLI entry point — runs main() only when this file is executed
   directly (`node scripts/docs-lint.js`), not when imported by
   tests/unit/docs-lint.test.js. We detect CLI mode via argv[1]'s
   basename rather than `fileURLToPath(import.meta.url)` because
   babel-jest transforms this file into CommonJS during testing and
   strips the `import.meta` syntax — using it here would crash at
   parse time. The basename check works in both runtimes:
     - CLI: argv[1] = '…/scripts/docs-lint.js' → match
     - Jest: argv[1] = '…/node_modules/jest/bin/jest.js' → no match
   The hardcoded basename couples this guard to the filename, which
   is the right trade-off — renames are deliberate and covered by
   the test suite (importing the renamed module would surface the
   stale string immediately). */
/* istanbul ignore next -- CLI entry; exercised in CI by `npm run lint:docs`, not under jest */
if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('/scripts/docs-lint.js')) {
  process.exit(main());
}
