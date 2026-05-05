/**
 * Unit tests for scripts/inject-doc-numbers.js — exercises the pure
 * `injectMarkers(content, metrics)` function, the public `MARKER_RE`,
 * and the CLI `--check` exit-code contract.
 *
 * Why this test file exists:
 *   inject-doc-numbers.js closes the "drift numerica nei doc" class
 *   identified across rounds 6-8 of the Apr 2026 follow-up. The drift
 *   would re-fire if the marker substitution itself were buggy
 *   (wrong key handling, greedy match across markers, idempotency
 *   broken). This suite pins the contract: matching syntax, key
 *   handling, idempotency, no-op when current.
 *
 * Round-21 addition: smoke tests for the CLI `--check` mode against
 * a sandbox fixture. CI uses `npm run docs:numbers:check` as a
 * blocking gate; a regression that flips its exit code (e.g. exit 0
 * when markers are stale) would let drift through silently. The
 * smoke tests below pin BOTH terminal states by spawning the script
 * with controlled `.deploy/` inputs.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  injectMarkers,
  MARKER_RE,
  MARKER_RE_HTML,
  MARKER_RE_JS,
} from '../../scripts/inject-doc-numbers.js';

const ROOT = path.join(__dirname, '..', '..');

describe('MARKER_RE — marker syntax', () => {
  test('matches a single inline marker', () => {
    const matches = [...'~<!-- AUTO:JS_GZIP -->1.0<!-- /AUTO --> KB'.matchAll(MARKER_RE)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('JS_GZIP');
    expect(matches[0][2]).toBe('1.0');
  });

  test('matches two markers on the same line independently (non-greedy)', () => {
    /* Pinning the non-greedy `(.*?)` capture: a greedy version would
       collapse the two markers into one giant match starting at the
       first `<!-- AUTO:` and ending at the SECOND `<!-- /AUTO -->`,
       overwriting both keys with a single garbled value. */
    const line =
      'JS <!-- AUTO:JS_RAW -->2.3<!-- /AUTO --> raw / <!-- AUTO:JS_GZIP -->1.0<!-- /AUTO --> gzip';
    const matches = [...line.matchAll(MARKER_RE)];
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m[1])).toEqual(['JS_RAW', 'JS_GZIP']);
    expect(matches.map((m) => m[2])).toEqual(['2.3', '1.0']);
  });

  test('matches markers across multiple lines with the same key', () => {
    const text = 'first <!-- AUTO:K -->a<!-- /AUTO -->\nsecond <!-- AUTO:K -->b<!-- /AUTO -->';
    const matches = [...text.matchAll(MARKER_RE)];
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m[1] === 'K')).toBe(true);
  });

  test('does NOT match malformed markers (missing close tag)', () => {
    expect([...'<!-- AUTO:K -->no-close'.matchAll(MARKER_RE)]).toEqual([]);
  });

  test('does NOT match malformed markers (missing key)', () => {
    expect([...'<!-- AUTO: -->x<!-- /AUTO -->'.matchAll(MARKER_RE)]).toEqual([]);
  });
});

describe('injectMarkers — replacement behaviour', () => {
  test('updates a marker whose body differs from the metrics value', () => {
    const before = '~<!-- AUTO:JS_GZIP -->stale<!-- /AUTO --> KB';
    const { updated, changed, unknown } = injectMarkers(before, { JS_GZIP: '1.0' });
    expect(updated).toBe('~<!-- AUTO:JS_GZIP -->1.0<!-- /AUTO --> KB');
    expect(changed).toBe(1);
    expect(unknown).toEqual([]);
  });

  test('leaves a marker unchanged when its body already matches', () => {
    const before = '~<!-- AUTO:JS_GZIP -->1.0<!-- /AUTO --> KB';
    const { updated, changed } = injectMarkers(before, { JS_GZIP: '1.0' });
    expect(updated).toBe(before);
    expect(changed).toBe(0);
  });

  test('idempotency — running twice produces no further changes', () => {
    const before = '<!-- AUTO:K -->stale<!-- /AUTO -->';
    const first = injectMarkers(before, { K: 'fresh' });
    const second = injectMarkers(first.updated, { K: 'fresh' });
    expect(first.updated).toBe('<!-- AUTO:K -->fresh<!-- /AUTO -->');
    expect(second.updated).toBe(first.updated);
    expect(second.changed).toBe(0);
  });

  test('updates multiple markers in a single string with mixed staleness', () => {
    const before =
      'a <!-- AUTO:A -->old<!-- /AUTO --> b <!-- AUTO:B -->fresh<!-- /AUTO --> c <!-- AUTO:A -->old<!-- /AUTO -->';
    const { updated, changed } = injectMarkers(before, { A: 'fresh', B: 'fresh' });
    expect(updated).toBe(
      'a <!-- AUTO:A -->fresh<!-- /AUTO --> b <!-- AUTO:B -->fresh<!-- /AUTO --> c <!-- AUTO:A -->fresh<!-- /AUTO -->',
    );
    expect(changed).toBe(2); // two A occurrences flipped; B was already fresh
  });

  test('flags unknown keys without mutating them', () => {
    const before = '<!-- AUTO:DEFINED -->x<!-- /AUTO --> <!-- AUTO:UNKNOWN -->y<!-- /AUTO -->';
    const { updated, unknown } = injectMarkers(before, { DEFINED: 'updated' });
    expect(updated).toBe(
      '<!-- AUTO:DEFINED -->updated<!-- /AUTO --> <!-- AUTO:UNKNOWN -->y<!-- /AUTO -->',
    );
    /* The UNKNOWN marker is left as-is; the caller's main() reports
       the unknown key list and exits non-zero so the maintainer adds
       the metric or removes the marker. */
    expect(unknown).toEqual(['UNKNOWN']);
  });

  test('returns the original content untouched when no markers are present', () => {
    const before = 'plain text with no markers at all';
    const { updated, changed, unknown } = injectMarkers(before, {});
    expect(updated).toBe(before);
    expect(changed).toBe(0);
    expect(unknown).toEqual([]);
  });

  test('handles empty marker bodies (initial-state case)', () => {
    /* Newly-added markers may be committed empty — the script should
       fill them in on the next run. */
    const before = 'value: <!-- AUTO:K --><!-- /AUTO --> here';
    const { updated, changed } = injectMarkers(before, { K: 'filled' });
    expect(updated).toBe('value: <!-- AUTO:K -->filled<!-- /AUTO --> here');
    expect(changed).toBe(1);
  });

  test('preserves surrounding whitespace and prose verbatim', () => {
    const before = `# Heading

The bundle is ~<!-- AUTO:JS_RAW -->stale<!-- /AUTO --> KB raw.

| col | <!-- AUTO:K -->old<!-- /AUTO --> | extra |
`;
    const after = `# Heading

The bundle is ~<!-- AUTO:JS_RAW -->2.3<!-- /AUTO --> KB raw.

| col | <!-- AUTO:K -->new<!-- /AUTO --> | extra |
`;
    const { updated } = injectMarkers(before, { JS_RAW: '2.3', K: 'new' });
    expect(updated).toBe(after);
  });
});

/* The JS-syntax marker is `/` + `*` + ` AUTO:KEY ` + `*` + `/` ... `/` + `*` + ` /AUTO ` + `*` + `/`.
   We can't write the literal in this comment because the `*` + `/` would
   close the surrounding block — we build the markers from concatenation
   in the test fixtures below. */
const JS_OPEN = (key) => `/${'*'} AUTO:${key} ${'*'}/`;
const JS_CLOSE = `/${'*'} /AUTO ${'*'}/`;
const jsMark = (key, val) => `${JS_OPEN(key)}${val}${JS_CLOSE}`;

describe('MARKER_RE_HTML / MARKER_RE_JS — two syntax variants exposed', () => {
  test('MARKER_RE is a back-compat alias for MARKER_RE_HTML', () => {
    expect(MARKER_RE).toBe(MARKER_RE_HTML);
  });

  test('MARKER_RE_HTML matches HTML/Markdown form only, not JS form', () => {
    const html = '<!-- AUTO:K -->v<!-- /AUTO -->';
    const js = jsMark('K', 'v');
    expect([...html.matchAll(MARKER_RE_HTML)]).toHaveLength(1);
    expect([...js.matchAll(MARKER_RE_HTML)]).toHaveLength(0);
  });

  test('MARKER_RE_JS matches JS/CSS source form only, not HTML form', () => {
    const html = '<!-- AUTO:K -->v<!-- /AUTO -->';
    const js = jsMark('K', 'v');
    expect([...html.matchAll(MARKER_RE_JS)]).toHaveLength(0);
    expect([...js.matchAll(MARKER_RE_JS)]).toHaveLength(1);
  });

  test('MARKER_RE_JS captures key + value separately', () => {
    const matches = [...jsMark('JS_GZIP', '1.0').matchAll(MARKER_RE_JS)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('JS_GZIP');
    expect(matches[0][2]).toBe('1.0');
  });
});

describe('injectMarkers — JS-syntax marker substitution', () => {
  test('replaces a JS-style marker', () => {
    const before = `js: { warn: 1.2 }, // current ${jsMark('JS_GZIP', 'stale')}`;
    const after = `js: { warn: 1.2 }, // current ${jsMark('JS_GZIP', '1.0')}`;
    const { updated, changed, unknown } = injectMarkers(before, { JS_GZIP: '1.0' });
    expect(updated).toBe(after);
    expect(changed).toBe(1);
    expect(unknown).toEqual([]);
  });

  test('idempotency for JS-style markers', () => {
    const before = jsMark('K', 'fresh');
    const first = injectMarkers(before, { K: 'fresh' });
    const second = injectMarkers(first.updated, { K: 'fresh' });
    expect(first.updated).toBe(before);
    expect(second.changed).toBe(0);
  });

  test('handles HTML and JS markers together in the same content', () => {
    /* An unusual but possible case: a markdown file containing a JS
       code-fence block whose example uses JS-syntax markers. Both
       passes run and update independently. */
    const before = `<!-- AUTO:JS_GZIP -->stale<!-- /AUTO -->\n${jsMark('JS_RAW', 'stale')}`;
    const { updated, changed } = injectMarkers(before, { JS_GZIP: '1.0', JS_RAW: '2.3' });
    expect(updated).toBe(`<!-- AUTO:JS_GZIP -->1.0<!-- /AUTO -->\n${jsMark('JS_RAW', '2.3')}`);
    expect(changed).toBe(2);
  });

  test('JS-style unknown key is reported and the marker is left untouched', () => {
    const before = jsMark('UNDEFINED_KEY', 'x');
    const { updated, unknown } = injectMarkers(before, { OTHER: 'y' });
    expect(updated).toBe(before);
    expect(unknown).toEqual(['UNDEFINED_KEY']);
  });
});

/* ─── CLI `--check` exit-code contract ──────────────────────────────────────
   The `npm run docs:numbers:check` command is a CI gate: it MUST exit
   non-zero when markers are stale (otherwise CI silently passes a PR
   that ships out-of-date doc numbers).

   These smoke tests prerequisite a populated `.deploy/` (the script
   reads metrics from there). When `.deploy/` is absent we skip — same
   pattern as `tests/unit/scripts.test.js`. The tests sandbox a
   complete repo copy (source + .deploy/) into a tmp dir and mutate
   ONE marker in it to assert that --check correctly distinguishes
   "fresh" vs "stale". */
const DEPLOY_PRESENT = existsSync(path.join(ROOT, '.deploy', 'dist', 'main.min.js'));
if (!DEPLOY_PRESENT) {
  console.warn(
    '[inject-doc-numbers.test.js] skipping CLI --check smoke suite: ' +
      '.deploy/ inputs missing. Run `npm run build` first to enable.',
  );
}
const describeIfDeploy = DEPLOY_PRESENT ? describe : describe.skip;

describeIfDeploy('CLI --check exit-code contract', () => {
  let sandbox;

  beforeAll(() => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'ghironda-inject-'));
    /* Mirror the entire repo into the sandbox: the script walks
       `git ls-files` (which we re-run here, so the sandbox needs
       the full tracked tree + .git) AND reads from .deploy/.
       Easiest: copy main artefacts. Alternative would be to mock
       the file walker, but that would test the mock, not the CLI. */
    /* The script reads:
         - .deploy/ (size metrics)
         - source index.html (LOC_HTML — round 21 fix)
         - source sw.js (LOC_JS_PROD)
         - css/, js/ (LOC counts)
         - tests/ (test counts via git ls-files)
         - fonts/, images/ (file sizes)
         - package.json (engines), scripts/performance-budget.js (budget)
       Mirror all of them so the spawned script sees an identical
       repo shape inside the sandbox. */
    cpSync(path.join(ROOT, 'package.json'), path.join(sandbox, 'package.json'));
    cpSync(path.join(ROOT, 'index.html'), path.join(sandbox, 'index.html'));
    cpSync(path.join(ROOT, 'sw.js'), path.join(sandbox, 'sw.js'));
    cpSync(path.join(ROOT, 'scripts'), path.join(sandbox, 'scripts'), { recursive: true });
    cpSync(path.join(ROOT, 'css'), path.join(sandbox, 'css'), { recursive: true });
    cpSync(path.join(ROOT, 'js'), path.join(sandbox, 'js'), { recursive: true });
    cpSync(path.join(ROOT, 'tests'), path.join(sandbox, 'tests'), { recursive: true });
    cpSync(path.join(ROOT, 'fonts'), path.join(sandbox, 'fonts'), { recursive: true });
    cpSync(path.join(ROOT, 'images'), path.join(sandbox, 'images'), { recursive: true });
    cpSync(path.join(ROOT, '.deploy'), path.join(sandbox, '.deploy'), { recursive: true });
    /* Copy README so the marker discovery has a canonical doc to
       scan + a known-good baseline to compare. */
    cpSync(path.join(ROOT, 'README.md'), path.join(sandbox, 'README.md'));

    /* Initialise a temp git repo so `git ls-files` returns the
       tracked surface. Stage everything as the initial state. */
    spawnSync('git', ['init', '-q'], { cwd: sandbox });
    spawnSync('git', ['add', '-A'], { cwd: sandbox });
    spawnSync(
      'git',
      ['-c', 'user.email=t@e.st', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'],
      {
        cwd: sandbox,
      },
    );
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  test('exits 0 when every marker is fresh', () => {
    /* The just-built .deploy/ matches the just-injected source
       markers, so --check should be a no-op. Diagnostic output is
       captured in case of regression. */
    const result = spawnSync('node', ['scripts/inject-doc-numbers.js', '--check'], {
      cwd: sandbox,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      console.error(
        '[--check exits 0 test] unexpected failure\n' +
          `stdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/every marker is current/);
  });

  test('exits 1 with diagnostic when a marker has drifted', () => {
    /* Mutate ONE marker in the sandbox README to a deliberately
       stale value. --check must detect the drift and exit 1. */
    const readmePath = path.join(sandbox, 'README.md');
    const original = require('node:fs').readFileSync(readmePath, 'utf8');
    /* Find the first AUTO marker, replace its body with garbage. */
    const drifted = original.replace(/(<!-- AUTO:[A-Z_]+ -->)([^<]*)(<!-- \/AUTO -->)/, '$199.9$3');
    expect(drifted).not.toBe(original); // sanity — we found a marker
    writeFileSync(readmePath, drifted);

    try {
      const result = spawnSync('node', ['scripts/inject-doc-numbers.js', '--check'], {
        cwd: sandbox,
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/marker.*out of date/i);
      expect(result.stderr).toMatch(/Run.*npm run docs:numbers/);
    } finally {
      writeFileSync(readmePath, original);
    }
  });
});
