#!/usr/bin/env node

/**
 * JavaScript Build Script - esbuild Bundling & Minification
 *
 * Usa esbuild per risolvere import/export ES6 nativamente (no regex stripping),
 * bundlare in IIFE browser-safe, minificare e generare sourcemap.
 *
 * Entry point: js/main.js (risolve tutte le dipendenze automaticamente)
 * Output: .deploy/dist/main.min.js
 *
 * Round 20 (option B production-grade): output goes to `.deploy/`
 * (gitignored, pushed to `gh-pages` by the CI deploy workflow). The
 * source tree is never mutated.
 *
 * Sourcemap policy:
 *   default                       → no .map shipped (production-safe).
 *   NODE_ENV=development          → external .map for local debugging.
 *
 * Any stale .map file from a previous dev build is deleted on a production
 * build so we never accidentally publish source code to public visitors.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENTRY = path.join(__dirname, 'js/main.js');
const DEPLOY_DIR = path.join(__dirname, '.deploy');
const OUT_JS = path.join(DEPLOY_DIR, 'dist', 'main.min.js');
const IS_DEV = process.env.NODE_ENV === 'development';

console.log(
  `📦 Bundling JavaScript with esbuild${IS_DEV ? ' (development, with sourcemap)' : ' (production)'}...`,
);

fs.mkdirSync(path.dirname(OUT_JS), { recursive: true });

const result = await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  minify: true,
  sourcemap: IS_DEV,
  outfile: OUT_JS,
  format: 'iife', // Self-contained IIFE — compatible with <script defer src="...">
  platform: 'browser',
  // No target downgrade: the site already requires IntersectionObserver (Chrome 51+, Firefox 55+)
  // Output stays modern ES — esbuild bundles+minifies without rewriting syntax
  logLevel: 'warning',
  legalComments: 'none',
});

// Strip a stale dev .map file from production builds so a previous
// `NODE_ENV=development` run can never leak source through deploy.
if (!IS_DEV) {
  const stale = OUT_JS + '.map';
  if (fs.existsSync(stale)) {
    fs.unlinkSync(stale);
    console.log('🧹 Removed stale sourcemap: .deploy/dist/main.min.js.map');
  }
}

if (result.errors.length > 0) {
  console.error('❌ esbuild errors:', result.errors);
  process.exit(1);
}

if (!fs.existsSync(OUT_JS)) {
  console.error('❌ esbuild produced no output');
  process.exit(1);
}

const sizeKB = (fs.statSync(OUT_JS).size / 1024).toFixed(2);
console.log(`✅ Bundled & minified → .deploy/dist/main.min.js`);
console.log(`📊 Final size: ${sizeKB} KB`);
