/**
 * Smoke tests for build pipeline scripts.
 *
 * These scripts have side effects (read+write files, process.exit on
 * errors) and we explicitly DO NOT mutate the committed working tree
 * during testing. Pattern: copy the relevant inputs into an OS temp
 * directory, run the script with `cwd` pointing at that temp, then
 * assert on the resulting files. After the test the temp dir is
 * cleaned up — committed `index.html` and `sw.js` are never touched.
 *
 * Why these specifically:
 *   - cache-bust.js: critical for SW cache invalidation. Bug = stale
 *     cached assets in production.
 *   - generate-csp.js: critical for CSP correctness. Bug = inline
 *     <style>/<script> blocked in production.
 *
 * Other scripts (size-report, performance-budget, etc.) are
 * read-only diagnostics; their failure modes surface in CI logs
 * regardless and don't change deployable artifacts.
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');

/* The smoke tests only make sense after `npm run build` has produced
   .deploy/. Round 20 (option B): build artefacts live under
   `.deploy/`, not `dist/`. The sandbox replicates the deploy layout
   below.

   Behaviour when prerequisites are absent:
     - Local dev (`npm run test:unit` on a fresh checkout, no build):
       skip the two suites with a single warning. The remaining 213
       tests still run and provide value during iteration.
     - CI: the build job runs `npm run build` BEFORE invoking
       `npm run test:unit:ci`, so .deploy/ is always present and both
       suites execute. The `.github/workflows/test.yml` "unit-tests"
       job carries the explicit build step that makes this contract
       enforceable.

   We deliberately do NOT throw at module load: that pattern made
   `npm run test:unit` from a fresh clone explode in the
   pre-flight phase, masking real test failures behind a single
   prerequisite error. Skip-with-warning surfaces the gap without
   breaking unrelated test suites. */
const deployMain = path.join(ROOT, '.deploy', 'dist', 'main.min.js');
const deployCss = path.join(ROOT, '.deploy', 'dist', 'style-deferred.min.css');
const deployHtml = path.join(ROOT, '.deploy', 'index.html');
const deploySw = path.join(ROOT, '.deploy', 'sw.js');

const PREREQS_PRESENT =
  existsSync(deployMain) && existsSync(deployCss) && existsSync(deployHtml) && existsSync(deploySw);

if (!PREREQS_PRESENT) {
  console.warn(
    '[scripts.test.js] skipping cache-bust + generate-csp smoke suites: ' +
      '.deploy/ inputs missing. Run `npm run build` first to enable them. ' +
      '(Other 213 unit tests will still run.)',
  );
}

/* Conditional describe — under jest, `describe.skip` registers the
   suite as skipped (yellow in the report) without failing. The
   alternative (wrapping each test in `if (PREREQS_PRESENT)`) buries
   the gating in test bodies and surfaces less clearly. */
const describeIfPrereqs = PREREQS_PRESENT ? describe : describe.skip;

/* Build a fresh sandbox per test: copies of all inputs the scripts
   need, plus a vendored copy of the script itself with paths rewritten
   to the sandbox. The sandbox MUST contain a top-level `package.json`
   because every script now anchors `ROOT` via `findRepoRoot()`
   (scripts/lib/repo-root.js) — the walker ascends from `process.cwd()`
   until it finds a sibling `package.json`. Without one in the sandbox
   the walker would either reach the OS tmp dir (which on some
   machines has its own `package.json`) or throw — both produce
   misleading "input missing" failures unrelated to the test's intent.
   Round 20: cache-bust.js / generate-csp.js operate on
   `<root>/.deploy/`. The sandbox mirrors that exact tree, sourced
   from the host repo's `.deploy/` (post-build artefacts). A minimal
   `{ "type": "module" }` package.json is sufficient — the scripts
   only consult its presence, not its contents. */
function makeSandbox() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ghironda-smoke-'));
  cpSync(path.join(ROOT, '.deploy'), path.join(dir, '.deploy'), { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }\n');
  return dir;
}

/* Copy the scripts/ tree into the sandbox and execute the requested
   script with `cwd: sandbox`. The script discovers its `ROOT` via
   `findRepoRoot()`, which walks up from cwd and finds the
   sandbox-local `package.json` written by `makeSandbox()` above. */
function runScriptInSandbox(sandboxDir, scriptRelPath, env = {}) {
  const scriptsDest = path.join(sandboxDir, 'scripts');
  cpSync(path.join(ROOT, 'scripts'), scriptsDest, { recursive: true });
  const scriptAbs = path.join(sandboxDir, scriptRelPath);
  execSync(`node "${scriptAbs}"`, {
    cwd: sandboxDir,
    stdio: 'pipe',
    env: { ...process.env, ...env },
  });
}

describeIfPrereqs('scripts/cache-bust.js — composite hash invariants', () => {
  let sandbox;
  beforeAll(() => {
    sandbox = makeSandbox();
  });
  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  test('rewrites .deploy/index.html and .deploy/sw.js with matching 8-hex composite hashes', () => {
    runScriptInSandbox(sandbox, 'scripts/cache-bust.js');

    const html = readFileSync(path.join(sandbox, '.deploy', 'index.html'), 'utf8');
    const sw = readFileSync(path.join(sandbox, '.deploy', 'sw.js'), 'utf8');

    const htmlHashMatch = html.match(/dist\/main\.min\.js\?v=([a-f0-9]{8})/);
    const swHashMatch = sw.match(/CACHE_NAME\s*=\s*'ghironda-([a-f0-9]{8})'/);

    expect(htmlHashMatch).not.toBeNull();
    expect(swHashMatch).not.toBeNull();
    /* Composite hash invariant: HTML and SW must carry the IDENTICAL
       hash so cache eviction is in lockstep with the JS bundle. A
       drift here means stale clients fetch stale assets. */
    expect(htmlHashMatch[1]).toBe(swHashMatch[1]);
  });

  test('produces deterministic hash for unchanged inputs', () => {
    runScriptInSandbox(sandbox, 'scripts/cache-bust.js');
    const sw1 = readFileSync(path.join(sandbox, '.deploy', 'sw.js'), 'utf8');
    const hash1 = sw1.match(/ghironda-([a-f0-9]{8})/)[1];

    runScriptInSandbox(sandbox, 'scripts/cache-bust.js');
    const sw2 = readFileSync(path.join(sandbox, '.deploy', 'sw.js'), 'utf8');
    const hash2 = sw2.match(/ghironda-([a-f0-9]{8})/)[1];

    expect(hash1).toBe(hash2);
  });

  test('hash changes when any tracked asset changes', () => {
    runScriptInSandbox(sandbox, 'scripts/cache-bust.js');
    const swBefore = readFileSync(path.join(sandbox, '.deploy', 'sw.js'), 'utf8');
    const hashBefore = swBefore.match(/ghironda-([a-f0-9]{8})/)[1];

    /* Mutate one tracked input — the JS bundle. The composite hash
       should flip, otherwise the cache-bust is silently broken
       (the regression we explicitly fixed in scripts/cache-bust.js
       comments). */
    const distJs = path.join(sandbox, '.deploy', 'dist', 'main.min.js');
    const original = readFileSync(distJs);
    writeFileSync(distJs, Buffer.concat([original, Buffer.from('\n// drift')]));

    runScriptInSandbox(sandbox, 'scripts/cache-bust.js');
    const swAfter = readFileSync(path.join(sandbox, '.deploy', 'sw.js'), 'utf8');
    const hashAfter = swAfter.match(/ghironda-([a-f0-9]{8})/)[1];

    expect(hashAfter).not.toBe(hashBefore);

    /* Restore so the next test sees the canonical state. */
    writeFileSync(distJs, original);
  });
});

describeIfPrereqs('scripts/generate-csp.js — CSP meta hash invariants', () => {
  let sandbox;
  beforeAll(() => {
    sandbox = makeSandbox();
  });
  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  test('rewrites the CSP meta with SHA-256 hashes for every inline script and style', () => {
    runScriptInSandbox(sandbox, 'scripts/generate-csp.js', { NODE_ENV: 'production' });

    const html = readFileSync(path.join(sandbox, '.deploy', 'index.html'), 'utf8');
    const cspMatch = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
    expect(cspMatch).not.toBeNull();

    const csp = cspMatch[1];
    /* Required directives — pinned so a regression that drops one
       (e.g. omitting `script-src` entirely) is caught here, not on
       the deploy that breaks. */
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'sha256-");
    expect(csp).toContain("style-src 'self' 'sha256-");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");

    /* Every sha256- token must be a valid base64-encoded SHA-256 hash:
       exactly 44 chars (32 bytes → 43 chars + '=' padding) of
       base64-url-safe alphabet. A truncated/corrupted hash here
       silently breaks CSP enforcement in production. */
    const hashes = csp.match(/'sha256-[A-Za-z0-9+/=]+'/g) || [];
    expect(hashes.length).toBeGreaterThanOrEqual(2);
    for (const hash of hashes) {
      expect(hash).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
    }
  });
});
