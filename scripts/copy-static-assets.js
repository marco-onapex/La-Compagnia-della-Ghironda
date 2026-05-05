#!/usr/bin/env node
/**
 * copy-static-assets — round 20 (option B production-grade) build step
 * that mirrors every runtime-served file from the source tree into
 * `.deploy/`.
 *
 * The `.deploy/` directory is what gets pushed to the `gh-pages`
 * branch by `.github/workflows/deploy.yml`. `main` holds source only;
 * the deploy artefact is a pure derived view of that source. Anything
 * the browser fetches at runtime — fonts, images, the service worker,
 * the manifest, the sitemap — must therefore exist under `.deploy/` by
 * the time `deploy.yml` runs.
 *
 * What this script does NOT do:
 *   - It does NOT touch `.deploy/index.html`, `.deploy/dist/*`, or
 *     `.deploy/sitemap.xml`. Those are produced by `build-css.js`,
 *     `build-js.js`, and `update-sitemap.js` respectively. This script
 *     only handles the assets whose deployed bytes are byte-for-byte
 *     identical to source.
 *   - It does NOT copy the source `dist/` tree (which is gitignored)
 *     or `tests/`, `scripts/`, `node_modules/`, `coverage/`,
 *     `playwright-report/`, or any markdown documentation. Those are
 *     dev-only and never deployed.
 *
 * Idempotent: copying the same source onto an existing `.deploy/`
 * file with identical mtime + size is fine; this script always
 * overwrites because `cp -r` semantics here are "make destination
 * equal to source" rather than "merge".
 *
 * Position in the build chain (round 20):
 *   build:css → build:js → build:assets   ← THIS STEP
 *   → build:sitemap → build:cache-bust → build:csp → ...
 *
 * Order matters: `build:cache-bust` reads `.deploy/sw.js` and rewrites
 * its `CACHE_NAME`, so `sw.js` must already be present in `.deploy/`.
 * It also reads asset files (font woff2, hero webp, ring svg) for the
 * composite hash, so those need to be in place too.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEPLOY = path.join(ROOT, '.deploy');

/* Whole directories mirrored verbatim. Listed by name so adding a
   new asset directory (e.g. `videos/`) is one line, and so the set
   is reviewable at a glance.
   `.well-known/` currently holds `security.txt` (RFC 9116 disclosure
   contact + Expires). Future runtime files served from that root —
   ACME challenge tokens, `dmarc.json`, `apple-app-site-association`,
   `assetlinks.json` — would land there too and ship automatically. */
const DIR_COPIES = ['fonts', 'images', '.well-known'];

/* Individual files mirrored verbatim. `sitemap.xml` is intentionally
   absent from this list — `update-sitemap.js` writes its own copy
   into `.deploy/` with the dated `<lastmod>`. `index.html` is
   absent because `build-css.js` writes it with the inline critical
   CSS injected. */
const FILE_COPIES = ['manifest.webmanifest', 'robots.txt', 'humans.txt', 'sw.js', 'LICENSE'];

function copyFileEnsureDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
    /* Ignore symlinks / sockets / fifos — none of those exist in this
       repo and silently skipping them avoids cross-platform surprises. */
  }
}

let copiedFiles = 0;
let copiedDirs = 0;

fs.mkdirSync(DEPLOY, { recursive: true });

for (const dir of DIR_COPIES) {
  const src = path.join(ROOT, dir);
  if (!fs.existsSync(src)) {
    console.error(`[ERROR] copy-static-assets: source directory missing: ${dir}`);
    process.exit(1);
  }
  copyDirRecursive(src, path.join(DEPLOY, dir));
  copiedDirs++;
}

for (const file of FILE_COPIES) {
  const src = path.join(ROOT, file);
  if (!fs.existsSync(src)) {
    console.error(`[ERROR] copy-static-assets: source file missing: ${file}`);
    process.exit(1);
  }
  copyFileEnsureDir(src, path.join(DEPLOY, file));
  copiedFiles++;
}

console.log(
  `✅ copy-static-assets: mirrored ${copiedDirs} dir(s) + ${copiedFiles} file(s) → .deploy/`,
);
