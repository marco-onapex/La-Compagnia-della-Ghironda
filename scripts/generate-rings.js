#!/usr/bin/env node
/**
 * Genera SVG statico con algoritmo fBm (Fractional Brownian Motion)
 * per i cerchi topografici della ghironda.
 *
 * Output: SVG inline pronto per essere incollato in index.html
 * Uso:    node scripts/generate-rings.js
 */

const PALETTE = ['#8B3A3A','#7A2F2F','#6B2424','#5A1A1A','#4A1515','#3A0F0F','#2A0A0A','#1a0505','#0a0000'];
const NUM_POINTS  = 80;
const FBM_OCTAVES = 3;

// imgW = dimensione massima della wrapper CSS (clamp cap = 720px).
// L'invariante del 282%: vb = 2.82 × imgW garantisce che r1_screen = image_half_diagonal
// per qualsiasi wrapper size, senza bisogno di conoscere il viewport.
const imgW = 720;
const imgH = Math.round(imgW * 153 / 280); // 393

// r1: cerchio interno che inscrive la bounding-box dell'immagine
const r1 = Math.sqrt(imgW ** 2 + imgH ** 2) / 2; // ≈ 410

// viewBox derivato da r1 (NON da r9) per mantenere l'invariante del 282%.
// vb = 2.82 × imgW → scale = CSS_width/vb = 2.82×wrapper/2.82×imgW = wrapper/imgW
// → r1_screen = r1 × wrapper/imgW = image_half_diagonal per qualsiasi wrapper. ✓
const vb   = Math.round(2.82 * imgW); // 2030
const half = Math.floor(vb / 2);      // 1015

// r9: cerchio esterno, indipendente dal viewBox.
// Dimensionato per coprire la semidiagonale di un viewport 4K (3840×2160)
// alla scala massima (scale ≈ 1.0 quando wrapper=720px).
// hero_half_diagonal(3840×2080) = sqrt(1920²+1040²) ≈ 2185px → r9 = 2300 con margine.
// I cerchi oltre vb_half (1015) renderizzano via overflow:visible dell'SVG
// e vengono clippati da overflow:hidden del .hero.
const r9 = 2300;

const ratio = Math.pow(r9 / r1, 1 / 8);
let paths = '';

for (let i = 8; i >= 0; i--) {
  const br      = r1 * Math.pow(ratio, i);
  const maxAmp  = br * (0.04 + i * 0.01);
  let d = '';

  for (let j = 0; j <= NUM_POINTS; j++) {
    const angle = (j / NUM_POINTS) * Math.PI * 2;
    let perturbation = 0, amp = maxAmp, freq = 2;
    for (let o = 0; o < FBM_OCTAVES; o++) {
      perturbation += Math.sin(angle * freq) * amp;
      freq *= 2;
      amp  *= 0.5;
    }
    const r = br + perturbation;
    d += (j === 0 ? 'M' : 'L') + (r * Math.cos(angle)).toFixed(1) + ',' + (r * Math.sin(angle)).toFixed(1);
  }
  d += 'Z';

  const fo = (0.8 - i * 0.08).toFixed(3);
  const sw = (2.2 + (i / 8) * 3.5).toFixed(1);
  const so = Math.max(0.95 - i * 0.07, 0.40).toFixed(2);
  const sc = i === 0 ? '#000000' : '#330000';

  paths += `<path d="${d}" fill="${PALETTE[8 - i]}" fill-opacity="${fo}" stroke="none"/>`;
  paths += `<path d="${d}" fill="none" stroke="${sc}" stroke-width="${sw}" opacity="${so}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${vb} ${vb}" class="ghironda-rings" aria-hidden="true" focusable="false"><g>${paths}</g></svg>`;

process.stderr.write(`fBm SVG: vb=${vb} half=${half}, r1=${r1.toFixed(0)} r9=${r9} ratio=${ratio.toFixed(3)}, chars=${svg.length}\n`);
process.stdout.write(svg);
