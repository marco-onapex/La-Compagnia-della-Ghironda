#!/usr/bin/env node
/**
 * Genera SVG statico con algoritmo fBm (Fractional Brownian Motion)
 * per i cerchi topografici della ghironda.
 *
 * Output: SVG inline pronto per essere incollato in index.html
 * Uso:    node scripts/generate-rings.js
 */

const PALETTE = ['#8B3A3A','#7A2F2F','#6B2424','#5A1A1A','#4A1515','#3A0F0F','#2A0A0A','#1a0505','#0a0000'];
const NUM_POINTS  = 80;   // punti per cerchio (200 = originale, 80 = buon compromesso)
const FBM_OCTAVES = 3;

// Dimensioni immagine: 55vw a ~1090px ≈ 600px, aspect-ratio 280:153
const imgW = 600;
const imgH = Math.round(600 * 153 / 280); // 327

// Centro e bordi hero tipico desktop 1440×900
const heroW = 1440, heroH = 900;
const cx = heroW / 2, cy = heroH / 2;

const r1 = Math.sqrt(imgW ** 2 + imgH ** 2) / 2;
const r9 = Math.max(
  Math.sqrt(cx ** 2 + cy ** 2),
  Math.sqrt((heroW - cx) ** 2 + cy ** 2),
  Math.sqrt(cx ** 2 + (heroH - cy) ** 2),
  Math.sqrt((heroW - cx) ** 2 + (heroH - cy) ** 2)
) * 0.95;

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

const vb   = Math.ceil(r9 * 2.1);
const half = Math.floor(vb / 2);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${vb} ${vb}" class="ghironda-rings" aria-hidden="true" focusable="false"><g>${paths}</g></svg>`;

process.stderr.write(`fBm SVG generato: vb=${vb}px, r1=${r1.toFixed(0)}px, r9=${r9.toFixed(0)}px, chars=${svg.length}\n`);
process.stdout.write(svg);
