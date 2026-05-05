#!/usr/bin/env node
/**
 * Genera le varianti WebP responsive della ghironda.
 *
 * Sorgente: images/ghironda.png (full-res, ~1.5 MB, con canale alpha).
 * NOTA: il file `images/ghironda.png` NON è tracciato in git (gitignored,
 *       see .gitignore) perché non è referenziato dall'HTML deployato e
 *       inflerebbe ogni clone di 1.5 MB + sprecherebbe banda CDN. I dev
 *       che vogliono rigenerare le varianti devono procurarselo
 *       esternamente (Drive/Figma/backup locale) e copiarlo a
 *       `images/ghironda.png` prima di lanciare questo script.
 *
 * Output:
 *   images/ghironda-280.webp   (mobile 1x)
 *   images/ghironda-420.webp   (mobile 1x large / 2x small)
 *   images/ghironda-560.webp   (mobile 2x)
 *   images/ghironda-720.webp   (desktop 1x)
 *   images/ghironda-1080.webp  (mobile 3x / tablet)
 *   images/ghironda.webp       (desktop 2x retina — full res WebP)
 *   images/ghironda-720.avif   (LCP candidate, AVIF q=40 ~30 KB)
 *   images/ghironda-fallback.png (deployed `<img src=>` fallback, palette PNG ~73 KB)
 *   images/og-card.jpg         (Open Graph / Twitter share card — 1200×630)
 *
 * Il vignette (gradiente radiale produzione) viene applicato durante la
 * generazione — cfr. scripts/apply-vignette.js per la documentazione
 * della formula. Se ghironda.png è già stato processato da apply-vignette.js,
 * il vignette viene applicato una seconda volta: usare una sorgente vergine.
 *
 * Utilizzo: node scripts/generate-images.js
 * Richiede: sharp (npm install sharp --save-dev)
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { applyVignette } from './lib/vignette.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'images', 'ghironda.png');

if (!existsSync(SRC)) {
  console.error(
    `\n[generate-images] FATAL: source PNG missing at ${SRC}\n\n` +
      `images/ghironda.png is gitignored (see .gitignore — it's a 1.5 MB\n` +
      `build asset that doesn't ship to production). Place a copy of the\n` +
      `high-res source at that path and re-run this script. The committed\n` +
      `WebP / AVIF / fallback variants do NOT need to be regenerated unless\n` +
      `the source artwork itself changed.\n`,
  );
  process.exit(1);
}

const SIZES = [
  // 720w is the LCP candidate on Lighthouse mobile emulation (Moto-G
  // viewport 412×823, DPR 1.75, ~380px CSS hero width → 665px effective
  // → browser picks 720w from the srcset). Quality 78 was tuned against
  // Lighthouse's `uses-responsive-images` audit. The companion AVIF
  // variant below (q=40, ~30 KB) is what modern browsers actually load
  // for the LCP — see <picture> in index.html. The WebP at q=78 remains
  // the fallback for the AVIF-less cohort.
  { width: 280, name: 'ghironda-280.webp', quality: 85 },
  { width: 420, name: 'ghironda-420.webp', quality: 85 },
  { width: 560, name: 'ghironda-560.webp', quality: 85 },
  { width: 720, name: 'ghironda-720.webp', quality: 78 },
  { width: 880, name: 'ghironda-880.webp', quality: 75 },
  { width: 1080, name: 'ghironda-1080.webp', quality: 85 },
  { width: 1408, name: 'ghironda.webp', quality: 85 },
];

/* AVIF for the LCP candidate ONLY. AVIF q=40 lands at ~30 KB on this
   image (vs ~70 KB WebP at q=78). On Lighthouse mobile (Slow-4G + 4×
   CPU), this combined with removing the redundant WebP preload is what
   crossed the LCP score 0.98 → 1.0 threshold and unlocked Performance
   100/100. Visually q=40 is indistinguishable on a hero-sized vignette
   illustration: the source has no fine text and the alpha mask collapses
   the edges to near-zero where AVIF blocking would be visible.
   The non-LCP variants stay WebP-only: they ship to viewports where
   the LCP audit doesn't apply, so the AVIF decode-cost premium
   (~30 ms on Moto G Power 4× CPU) outweighs the byte savings. */
const AVIF_VARIANTS = [{ width: 720, name: 'ghironda-720.avif', quality: 40 }];

/* Tiny PNG fallback for the long-tail browsers without WebP/AVIF
   support (Safari ≤ 13, Chrome ≤ 31, IE — collectively well under
   1 % of 2026 traffic). Referenced by `<img src=>` inside the
   `<picture>` so it ONLY loads when both <source> formats are
   rejected. 560 px width is enough to render acceptably at the
   hero CSS size on any viewport (the wrapper scales the image
   anyway); paletted (indexed) PNG cuts the byte count by ~5× vs
   RGBA at the same resolution.

   The source `images/ghironda.png` (1.5 MB at 1408 px) stays in
   the repo as the build source — it is no longer referenced by
   any deployed HTML, only consumed by this script. */
const PNG_FALLBACKS = [{ width: 560, name: 'ghironda-fallback.png', palette: true }];

/* Open Graph / Twitter share card — 1200×630 is the Facebook /
   LinkedIn / Discord canonical size; Twitter `summary_large_image`
   accepts it without cropping. Format JPEG q=88 instead of PNG:
     - JPEG keeps the file at ~80–120 KB vs ~250–400 KB for the
       equivalent truecolor PNG, well within every social crawler's
       fetch budget AND faster to load on Slow-4G.
     - Universal compatibility — every social-media crawler (Facebook,
       Twitter, Discord, Slack, WhatsApp, LinkedIn, Telegram) accepts
       JPEG; some older paths still mishandle WebP for og:image.
     - The vignette mask collapses the image edges to near-zero
       which JPEG compresses very efficiently (no high-frequency
       artefacts in the dark regions).
   The card is composed by:
     - vignetting at 1200 wide,
     - resizing with `fit:contain` to fit the source aspect (~1.83:1)
       into 1200×630 (~1.91:1) → ~22 px black bars left/right,
     - flattening alpha onto the brand night colour `#0f0a1a`
       (the source is RGBA — without flatten the JPEG encoder would
       discard alpha and substitute pure black, breaking the brand
       framing).
   Referenced from index.html by `og:image`, `twitter:image`. */
const OG_CARDS = [{ width: 1200, height: 630, name: 'og-card.jpg', quality: 88 }];

/* Brand icons — square, FULLY FILLED with night colour, artwork in
   the central 80 % maskable safe zone.

   Replaces the previous icon-{192,512}.png + apple-touch-icon.png
   that were generated by an earlier pipeline letterboxing the
   1.83:1 source artwork into a square canvas with TRANSPARENT bands
   on the SIDES. That broke two contracts:
     - Maskable PWA icons (W3C spec) require the canvas to be FULLY
       FILLED (no transparent regions) and the visible content
       confined to the central ≈80 % safe zone, so Android's circular
       /squircle mask can crop without exposing the system wallpaper
       through the alpha gaps. The previous icons declared
       `purpose: "any maskable"` while violating the maskable contract.
     - Schema.org Organization.logo is consumed by Google's Knowledge
       Panel which renders on a white background; transparent edges
       on a square logo show as visible white halos either side of
       the night-themed artwork — visually broken brand framing.

   For each canvas size we render the vignetted artwork into the
   safe-zone size first, then composite at the centre of a solid
   night canvas. Doing it in one sharp call with `fit:contain` would
   pad the artwork itself with night-colour bars before centring —
   same visual result, but the two-step version is easier to reason
   about and matches the maskable-icon mental model (canvas + safe
   zone content).

   Truecolor PNG output: palette would dither the dark gradient bands
   of the vignette into visible banding around the artwork at typical
   icon display sizes. compressionLevel 9 + effort 10 lands at
   ~10–50 KB across the three sizes — comparable to the legacy
   palette PNGs they replace.

   Consumers:
     - apple-touch-icon.png — <link rel="apple-touch-icon"> in
       index.html (180×180; iOS home-screen / dock tile).
     - icon-192.png + icon-512.png — manifest.webmanifest icons[]
       declared `purpose: "any maskable"` (Android home-screen
       /splash + Schema.org Organization.logo).

   Safe-zone ratio: 0.74 = ~378/512 ≈ 134/180. The W3C maskable
   spec recommends content inside an 80 % circle (= 0.8 * canvas in
   diameter terms); 0.74 is conservative enough that the entire
   artwork is inside even the strictest squircle mask. */
const SAFE_ZONE_RATIO = 0.74;
const ICONS = [
  { canvas: 512, name: 'icon-512.png' },
  { canvas: 192, name: 'icon-192.png' },
  { canvas: 180, name: 'apple-touch-icon.png' },
];

console.log('Generating WebP image variants from', SRC);

/* Cache the vignette-applied raw pixel buffer per width so we don't
   redo the per-pixel alpha math twice (once for WebP, once for AVIF)
   when the same width appears in both lists. */
const cache = new Map();
async function vignettedPixels(width) {
  if (cache.has(width)) return cache.get(width);
  const { data, info } = await sharp(SRC)
    .resize(width, null, { withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  applyVignette(pixels, info.width, info.height);
  const entry = { pixels, info };
  cache.set(width, entry);
  return entry;
}

for (const { width, name, quality } of SIZES) {
  const out = path.join(ROOT, 'images', name);
  const { pixels, info } = await vignettedPixels(width);
  const webp = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality, alphaQuality: 100 })
    .toFile(out);
  console.log(`✅ ${name}: ${webp.width}×${webp.height} — ${(webp.size / 1024).toFixed(1)} KB`);
}

for (const { width, name, quality } of AVIF_VARIANTS) {
  const out = path.join(ROOT, 'images', name);
  const { pixels, info } = await vignettedPixels(width);
  /* AVIF doesn't expose `alphaQuality`; alpha precision is controlled
     via `lossless` (full-quality alpha) or default (matched to the
     RGB quality). Default suits us — the vignette mask doesn't need
     bit-perfect alpha; near-zero values compress well at any quality. */
  const avif = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .avif({ quality })
    .toFile(out);
  console.log(`✅ ${name}: ${avif.width}×${avif.height} — ${(avif.size / 1024).toFixed(1)} KB`);
}

for (const { width, name, palette } of PNG_FALLBACKS) {
  const out = path.join(ROOT, 'images', name);
  const { pixels, info } = await vignettedPixels(width);
  const png = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, palette, effort: 10 })
    .toFile(out);
  console.log(
    `✅ ${name}: ${png.width}×${png.height} — ${(png.size / 1024).toFixed(1)} KB (palette PNG)`,
  );
}

for (const { width: cardW, height: cardH, name, quality } of OG_CARDS) {
  const out = path.join(ROOT, 'images', name);
  const { pixels, info } = await vignettedPixels(cardW);
  /* `fit:contain` letterboxes the input to the target aspect with
     `background` padding; `flatten` then composites any remaining
     alpha onto the same colour so the JPEG encoder (which has no
     alpha channel) doesn't substitute black for transparent
     regions of the original ghironda PNG. */
  const og = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(cardW, cardH, {
      fit: 'contain',
      background: { r: 15, g: 10, b: 26, alpha: 1 },
      position: 'center',
    })
    .flatten({ background: { r: 15, g: 10, b: 26 } })
    .jpeg({ quality, progressive: true, mozjpeg: true })
    .toFile(out);
  console.log(
    `✅ ${name}: ${og.width}×${og.height} — ${(og.size / 1024).toFixed(1)} KB (JPEG q=${quality})`,
  );
}

for (const { canvas, name } of ICONS) {
  const out = path.join(ROOT, 'images', name);
  const inner = Math.round(canvas * SAFE_ZONE_RATIO);
  const { pixels, info } = await vignettedPixels(inner);
  const innerPng = await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(inner, inner, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });

  const icon = await sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 15, g: 10, b: 26, alpha: 1 },
    },
  })
    .composite([{ input: innerPng.data, gravity: 'center' }])
    .flatten({ background: { r: 15, g: 10, b: 26 } })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(out);
  console.log(
    `✅ ${name}: ${icon.width}×${icon.height} — ${(icon.size / 1024).toFixed(1)} KB (truecolor PNG, ${inner}px safe-zone)`,
  );
}

console.log('✅ All variants generated.');
