#!/usr/bin/env node
/**
 * Genera SVG statico con algoritmo fBm (Fractional Brownian Motion)
 * per i cerchi topografici della ghironda.
 *
 * Output: SVG su stdout (redirigere a images/ghironda-rings.svg).
 * Uso:    node scripts/generate-rings.js > images/ghironda-rings.svg
 */

const PALETTE = [
  '#8B3A3A',
  '#7A2F2F',
  '#6B2424',
  '#5A1A1A',
  '#4A1515',
  '#3A0F0F',
  '#2A0A0A',
  '#1a0505',
  '#0a0000',
];
const NUM_POINTS = 80;
const FBM_OCTAVES = 3;

// vb = 1800 — viewBox padded to contain the outermost ring's fBm bumps.
// Outer ring (i=8): br=800, fBm peak ≈ 800 × 0.12 × 1.22 ≈ 117. Max polygon
// coord (at θ ≈ 13.5° from cardinal axes) measured at ≈880 in current SVG.
// half=900 leaves ~20 SVG units of safety margin. The fBm function is
// deterministic so the margin is stable across rebuilds — if r9 grows further
// or fBm amplitude scaling changes, bump VB to 2000 and update the CSS factor
// in 5-hero.css accordingly (Factor = VB/(2×R1) × √(1+(153/280)²)).
const vb = 1800;
const half = vb / 2; // 900

// r1 = 342  — innermost ring. Rings are rendered as a ::after pseudo-
//             element of .ghironda-wrapper (see 5-hero.css). The CSS
//             factor 2.999 sizes the SVG so ring1's CSS diameter equals
//             the ghironda wrapper rectangle's diagonal exactly — perfect
//             inscribing with 0% margin (per user spec).
//             Factor: 2.999 = VB/(2×R1) × √(1+(153/280)²)
//             The wrapper is centred at the hero geometric centre via the
//             grid layout in 5-hero.css (.hero-content uses grid-template-
//             rows: 1fr auto 1fr), so ring1 is concentric with the image —
//             no offset compensation needed.
//
// r9 = 800  — outermost ring. ratio r9/r1 ≈ 2.339 (geometric ratio per ring
//             ≈ 1.111) gives consecutive ring CSS distances that DILATE
//             progressively (geometric progression):
//                r2-r1 ≈ 57 px → r9-r8 ≈ 120 px at desktop reference.
//             Outer rings (ring6+) extend past the hero corners and
//             are cropped by `.hero { contain: paint }`, showing as side
//             arcs at the hero edges — completes the vignette look.
//
// ratio = (r9/r1)^(1/8) ≈ 1.1112 — geometric progression between 9 rings.
const r1 = 342;
const r9 = 800;

const ratio = Math.pow(r9 / r1, 1 / 8);
let paths = '';

for (let i = 8; i >= 0; i--) {
  const br = r1 * Math.pow(ratio, i);
  const maxAmp = br * (0.04 + i * 0.01);
  let d = '';

  for (let j = 0; j <= NUM_POINTS; j++) {
    const angle = (j / NUM_POINTS) * Math.PI * 2;
    let perturbation = 0,
      amp = maxAmp,
      freq = 2;
    for (let o = 0; o < FBM_OCTAVES; o++) {
      perturbation += Math.sin(angle * freq) * amp;
      freq *= 2;
      amp *= 0.5;
    }
    const r = br + perturbation;
    d +=
      (j === 0 ? 'M' : 'L') +
      (r * Math.cos(angle)).toFixed(1) +
      ',' +
      (r * Math.sin(angle)).toFixed(1);
  }
  d += 'Z';

  const fo = (0.8 - i * 0.08).toFixed(3);
  const sw = (2.2 + (i / 8) * 3.5).toFixed(1);
  const so = Math.max(0.95 - i * 0.07, 0.4).toFixed(2);
  const sc = i === 0 ? '#000000' : '#330000';

  paths += `<path d="${d}" fill="${PALETTE[8 - i]}" fill-opacity="${fo}" stroke="none"/>`;
  paths += `<path d="${d}" fill="none" stroke="${sc}" stroke-width="${sw}" opacity="${so}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${vb} ${vb}" class="ghironda-rings" aria-hidden="true" focusable="false"><g>${paths}</g></svg>`;

process.stderr.write(
  `fBm SVG: vb=${vb} half=${half}, r1=${r1} r9=${r9} ratio=${ratio.toFixed(4)}, chars=${svg.length}\n`,
);
process.stdout.write(svg);
