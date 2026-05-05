#!/usr/bin/env node
/**
 * Bake the production CSS composite mask into the ghironda image files.
 *
 * The CSS applies three mask layers composed with mask-composite: intersect
 * (alpha multiplication of all three layers):
 *
 *   Layer 1 — radial circle (farthest-corner):
 *     radial-gradient(circle at center,
 *       black 0%, black 63%, rgb(0 0 0 / 40%) 90%, rgb(0 0 0 / 0%) 100%)
 *     → fully opaque up to 63% of the farthest-corner radius,
 *       linear fade 1.0→0.4 from 63%→90%, linear fade 0.4→0.0 from 90%→100%.
 *
 *   Layer 2 — horizontal linear:
 *     linear-gradient(to right,
 *       transparent 0%, 30% at 3%, black 7%, black 93%, 30% at 97%, transparent 100%)
 *     → fades left and right edges over 7% of the element width.
 *
 *   Layer 3 — vertical linear:
 *     linear-gradient(to bottom,
 *       transparent 0%, 30% at 3%, black 7%, black 93%, 30% at 97%, transparent 100%)
 *     → fades top and bottom edges over 7% of the element height.
 *
 *   mask-composite: intersect → final_alpha = layer1 × layer2 × layer3
 *
 * The existing image alpha is then multiplied by final_alpha so any
 * pre-existing transparency in the source (the instrument outline) is preserved.
 *
 * Usage: node scripts/apply-vignette.js
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { applyVignette } from './lib/vignette.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'images', 'ghironda.png');

const SIZES = [
  { width: 280, name: 'ghironda-280.webp', quality: 85 },
  { width: 420, name: 'ghironda-420.webp', quality: 85 },
  { width: 560, name: 'ghironda-560.webp', quality: 85 },
  { width: 720, name: 'ghironda-720.webp', quality: 85 },
  { width: 1080, name: 'ghironda-1080.webp', quality: 85 },
  { width: 1408, name: 'ghironda.webp', quality: 85 },
];

async function buildVariant(targetWidth, outPath, quality) {
  const {
    data,
    info: { width, height },
  } = await sharp(SRC)
    .resize(targetWidth, null, { withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  applyVignette(pixels, width, height);

  const info = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .webp({ quality, alphaQuality: 100 })
    .toFile(outPath);

  console.log(
    `✅ ${path.basename(outPath)}: ${info.width}×${info.height} — ${(info.size / 1024).toFixed(1)} KB`,
  );
}

async function buildPngSource() {
  const {
    data,
    info: { width, height },
  } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  applyVignette(pixels, width, height);

  const info = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(SRC);

  console.log(
    `✅ ghironda.png: ${width}×${height} — ${(info.size / 1024).toFixed(1)} KB (source updated)`,
  );
}

console.log('Applying composite CSS mask to all ghironda image variants...\n');

for (const { width, name, quality } of SIZES) {
  await buildVariant(width, path.join(ROOT, 'images', name), quality);
}

await buildPngSource();

console.log('\nDone. Run `npm run build` to rebuild the CSS/JS bundles.');
