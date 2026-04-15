#!/usr/bin/env node
/**
 * Genera le varianti WebP responsive della ghironda.
 *
 * Sorgente: images/ghironda.png (full-res)
 * Output:
 *   images/ghironda-280.webp   (mobile 1x)
 *   images/ghironda-420.webp   (mobile 1x large / 2x small)
 *   images/ghironda-560.webp   (mobile 2x)
 *   images/ghironda-720.webp   (desktop 1x)
 *   images/ghironda-1080.webp  (mobile 3x / tablet)
 *   images/ghironda.webp       (desktop 2x retina — full res WebP)
 *
 * Utilizzo: node scripts/generate-images.js
 * Richiede: sharp (npm install sharp --save-dev)
 */

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'images', 'ghironda.png');

const SIZES = [
  { width: 280,  name: 'ghironda-280.webp',  quality: 85 },
  { width: 420,  name: 'ghironda-420.webp',  quality: 85 },
  { width: 560,  name: 'ghironda-560.webp',  quality: 85 },
  { width: 720,  name: 'ghironda-720.webp',  quality: 85 },
  { width: 1080, name: 'ghironda-1080.webp', quality: 85 },
  { width: 1408, name: 'ghironda.webp',       quality: 85 },
];

console.log('🖼️  Generating WebP image variants from', SRC);

for (const { width, name, quality } of SIZES) {
  const out = path.join(ROOT, 'images', name);
  const info = await sharp(SRC)
    .resize(width, null, { withoutEnlargement: true })
    .webp({ quality })
    .toFile(out);
  console.log(`✅ ${name}: ${info.width}×${info.height} — ${(info.size / 1024).toFixed(1)} KB`);
}

console.log('✅ All variants generated.');
