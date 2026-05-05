/**
 * scripts/lib/vignette.js
 *
 * Bake the production CSS composite mask into an RGBA pixel buffer.
 * Single-sourced for `scripts/apply-vignette.js` (canonical mask
 * application across every committed image variant) and
 * `scripts/generate-images.js` (responsive WebP/AVIF generation
 * pipeline) — round-23 audit found a near-identical copy in each.
 *
 * The CSS layered mask we replicate:
 *
 *   Layer 1 — radial circle (farthest-corner from center):
 *     radial-gradient(circle at center,
 *       black 0%, black 63%, rgb(0 0 0 / 40%) 90%, rgb(0 0 0 / 0%) 100%)
 *     → opaque to 63%, fades 1.0→0.4 from 63%→90%, fades 0.4→0.0 to 100%.
 *
 *   Layer 2 — horizontal linear (left → right):
 *     linear-gradient(to right,
 *       transparent 0%, 30% at 3%, black 7%, black 93%, 30% at 97%, transparent 100%)
 *
 *   Layer 3 — vertical linear (top → bottom):  same shape as layer 2.
 *
 *   mask-composite: intersect  →  final_alpha = layer1 × layer2 × layer3
 *
 * The image's existing alpha is then multiplied by `final_alpha`, so any
 * pre-existing transparency in the source (e.g. instrument outline) is
 * preserved.
 */

/**
 * Replicate the linear-gradient stops used for both horizontal and
 * vertical edge fades:
 *   transparent 0%, 30% at 3%, black 7%, black 93%, 30% at 97%, transparent 100%
 *
 * @param {number} t  Position along the axis, normalised 0..1.
 * @returns {number}  Alpha in 0..1.
 */
export function linearEdgeFade(t) {
  if (t <= 0.03) {
    return (t / 0.03) * 0.3;
  }
  if (t <= 0.07) {
    return 0.3 + ((t - 0.03) / 0.04) * 0.7;
  }
  if (t <= 0.93) {
    return 1;
  }
  if (t <= 0.97) {
    return 1 - ((t - 0.93) / 0.04) * 0.7;
  }
  return ((1 - t) / 0.03) * 0.3;
}

/**
 * Apply the layered CSS mask to an RGBA pixel buffer **in place**.
 * Multiplies each pixel's alpha channel by `radial × horiz × vert`.
 *
 * @param {Buffer | Uint8ClampedArray} pixels  Raw RGBA bytes (4 per pixel).
 * @param {number} width                       Image width in pixels.
 * @param {number} height                      Image height in pixels.
 */
export function applyVignette(pixels, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  // Radial layer uses CSS `circle at center` with the implicit
  // `farthest-corner` size; for a centred origin every corner is
  // equidistant, so a single hypot to the corner is the radius.
  const maxR = Math.hypot(cx, cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      // Layer 1 — radial.
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy) / maxR;
      let radial;
      if (d <= 0.63) {
        radial = 1;
      } else if (d <= 0.9) {
        radial = 1 - (0.6 * (d - 0.63)) / 0.27;
      } else if (d <= 1) {
        radial = (0.4 * (1 - d)) / 0.1;
      } else {
        radial = 0;
      }

      // Layers 2 & 3 — linear edges. The 1-pixel-wide image guard
      // (width === 1 / height === 1) treats the lone column/row as
      // the centre stop; without it, dividing by 0 yields NaN and
      // the alpha is silently zeroed.
      const horiz = linearEdgeFade(width <= 1 ? 0.5 : x / (width - 1));
      const vert = linearEdgeFade(height <= 1 ? 0.5 : y / (height - 1));

      pixels[i + 3] = Math.round(pixels[i + 3] * radial * horiz * vert);
    }
  }
}
