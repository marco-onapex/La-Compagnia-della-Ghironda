#!/usr/bin/env node
/**
 * Update `<lastmod>` in sitemap.xml to a DETERMINISTIC value derived from
 * `git log` of the source files that affect the rendered page.
 *
 * Why deterministic:
 * - `new Date()` produced a value that changed every wall-clock day, so
 *   the release-pipeline integrity check failed any time a release was
 *   dispatched on a different day from when the previous sitemap was
 *   committed — even when no source changed.
 * - Using the latest commit timestamp of the page sources means: same
 *   inputs → same lastmod → no spurious diff. Re-running the build on a
 *   pristine checkout is a no-op.
 *
 * Sources tracked: index.html + every CSS module + every JS module + the
 * service worker. Anything that changes the rendered page is in this set.
 *
 * Round 20 (option B): reads source `sitemap.xml`, writes the
 * date-substituted copy to `.deploy/sitemap.xml`. The source file is
 * never mutated — its placeholder `<lastmod>` stays as committed.
 *
 * Fail-loud contract (round 23): if `git log` is unavailable (shallow
 * clone without history, non-git tarball, missing git binary), the
 * script EXITS WITH 1 rather than falling back to today's wall-clock
 * date. The previous fallback silently broke the determinism invariant
 * — two builds of the same source on different days produced different
 * sitemaps, and the release-pipeline integrity check would flag a
 * spurious diff. Fail-loud surfaces the cause (e.g. CI clone is too
 * shallow) immediately. Workarounds for legitimate offline builds:
 *   - GitHub Actions: `actions/checkout` with `fetch-depth: 0`
 *   - Tarball deploys: pre-bake `.deploy/sitemap.xml` and skip this
 *     step in the offline pipeline.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SOURCE_SITEMAP = path.join(ROOT, 'sitemap.xml');
const DEPLOY_SITEMAP = path.join(ROOT, '.deploy', 'sitemap.xml');

const SOURCES = ['index.html', 'css', 'js', 'sw.js'];

function deriveLastmod() {
  try {
    /* `git log -1 --format=%cs -- <files>` returns YYYY-MM-DD of the
       most recent commit that touched any of the source paths. %cs is
       the committer date in short ISO format (Git 2.36+). */
    const args = SOURCES.map((s) => JSON.stringify(s)).join(' ');
    const out = execSync(`git log -1 --format=%cs -- ${args}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) {
      return { lastmod: out, source: 'git' };
    }
    console.error(
      `[sitemap] git log returned an unexpected format (got: "${out}"); refusing to write a non-deterministic sitemap.`,
    );
  } catch (err) {
    console.error(
      `[sitemap] git log unavailable (${err.message}); cannot derive a deterministic <lastmod>.`,
    );
  }
  console.error(
    'Resolve by running with full git history (e.g. CI: actions/checkout with fetch-depth: 0).',
  );
  process.exit(1);
}

const { lastmod, source } = deriveLastmod();
const before = fs.readFileSync(SOURCE_SITEMAP, 'utf8');
const after = before.replaceAll(
  /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g,
  `<lastmod>${lastmod}</lastmod>`,
);

fs.mkdirSync(path.dirname(DEPLOY_SITEMAP), { recursive: true });
fs.writeFileSync(DEPLOY_SITEMAP, after);
console.log(`[sitemap] lastmod → ${lastmod} (${source}) → .deploy/sitemap.xml`);
