#!/usr/bin/env node
/**
 * Font Conversion: TTF → WOFF2
 *
 * Converts self-hosted Cinzel TTF fonts to WOFF2 format.
 * Run manually when source TTF files change: npm run build:fonts
 *
 * WOFF2 is ~59% smaller than TTF, improving FCP/LCP on slow networks.
 * The TTF files are kept as fallback in @font-face src lists.
 *
 * NOT in the FONTS array below:
 *   - crimson-text-400.woff2 / crimson-text-400-italic.woff2
 *
 * These were sourced pre-converted (no .ttf source in repo). If you ever
 * need to regenerate them, drop the corresponding `.ttf` into `fonts/` and
 * add the basename to FONTS — the loop below will pick it up automatically.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { default as ttf2woff2 } from 'ttf2woff2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONTS_DIR = path.join(__dirname, '..', 'fonts');

const FONTS = ['cinzel-400', 'cinzel-600', 'cinzel-700', 'cinzel-decorative-400'];

let totalSaved = 0;

for (const name of FONTS) {
  const ttfPath = path.join(FONTS_DIR, `${name}.ttf`);
  const woff2Path = path.join(FONTS_DIR, `${name}.woff2`);

  if (!existsSync(ttfPath)) {
    console.error(`[ERROR] Source TTF missing: ${ttfPath}`);
    process.exit(1);
  }

  const input = readFileSync(ttfPath);
  const output = ttf2woff2(input);
  writeFileSync(woff2Path, output);

  const saved = input.length - output.length;
  totalSaved += saved;
  console.log(
    `${name}.ttf (${(input.length / 1024).toFixed(1)} KB)` +
      ` → ${name}.woff2 (${(output.length / 1024).toFixed(1)} KB)` +
      ` — saved ${((saved / input.length) * 100).toFixed(1)}%`,
  );
}

console.log(`\nTotal saved: ${(totalSaved / 1024).toFixed(1)} KB`);
