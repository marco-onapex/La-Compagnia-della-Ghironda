#!/usr/bin/env node
/**
 * Subset Cinzel-700 to LCP-region characters only.
 *
 * The hero region (h1, hero-subtitle, skip-link, header-title) uses
 * Cinzel-700. Lighthouse mobile reports the LCP element as
 * `section.hero` and the dominant cost in `Element render delay` is
 * font shaping for the Cinzel-700 glyphs needed in that region.
 *
 * The full Cinzel-700 woff2 (Latin + Latin-1 + Latin Extended-A subset)
 * is ~16 KB. The LCP-region only needs ~30 unique characters across
 * h1 / subtitle / skip-link / title — yielding a ~1.5-2 KB woff2.
 *
 * This script generates `cinzel-700-lcp.woff2` from the source TTF;
 * the full `cinzel-700.woff2` continues to serve all other contexts
 * (section headings, footer) via a regular @font-face declaration.
 *
 * The two fonts use DISTINCT font-family names (`Cinzel LCP` for the
 * subset, `Cinzel` for the full) so browser font-matching doesn't
 * race to download the wrong file. This is more robust than the
 * unicode-range trick, which depends on text-transform timing.
 *
 * Run: node scripts/subset-fonts-lcp.js (or via npm run build:fonts:lcp)
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { default as subsetFont } from 'subset-font';

import { HERO_TEXT } from './lib/font-text-constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONTS_DIR = path.join(__dirname, '..', 'fonts');

const SOURCE_TTF = path.join(FONTS_DIR, 'cinzel-700.ttf');
const OUTPUT_WOFF2 = path.join(FONTS_DIR, 'cinzel-700-lcp.woff2');

/* LCP-region text — sourced from `scripts/lib/font-text-constants.js`,
   asserted against the actual rendered DOM by
   `tests/unit/font-subset-coverage.test.js`.

   We pass BOTH cases to the subsetter because `text-transform:
   uppercase` (applied to every LCP element) is performed BEFORE
   shaping per the CSS Text spec — the browser asks the font for
   uppercase glyphs even when the source DOM contains lowercase
   characters. Sub-2 KB delta either way; defensive belt is cheaper
   than a single missing-glyph fallback in the hero. */
function envelope(source) {
  const chars = new Set();
  for (const ch of source) chars.add(ch);
  for (const ch of source.toLowerCase()) chars.add(ch);
  for (const ch of source.toUpperCase()) chars.add(ch);
  return [...chars].join('');
}
const LCP_TEXT = envelope(HERO_TEXT);

if (!existsSync(SOURCE_TTF)) {
  console.error(`[ERROR] Source TTF missing: ${SOURCE_TTF}`);
  process.exit(1);
}

const sourceBuf = readFileSync(SOURCE_TTF);
const subsetted = await subsetFont(sourceBuf, LCP_TEXT, { targetFormat: 'woff2' });
writeFileSync(OUTPUT_WOFF2, subsetted);

const fullSize = existsSync(path.join(FONTS_DIR, 'cinzel-700.woff2'))
  ? statSync(path.join(FONTS_DIR, 'cinzel-700.woff2')).size
  : null;

console.log(
  `cinzel-700-lcp.woff2: ${(subsetted.length / 1024).toFixed(2)} KB ` +
    `(LCP text: ${new Set(LCP_TEXT).size} unique chars)`,
);
if (fullSize) {
  const saved = fullSize - subsetted.length;
  const pct = ((saved / fullSize) * 100).toFixed(1);
  console.log(
    `vs full cinzel-700.woff2: ${(fullSize / 1024).toFixed(2)} KB ` +
      `(saved ${(saved / 1024).toFixed(2)} KB, ${pct}%)`,
  );
}
