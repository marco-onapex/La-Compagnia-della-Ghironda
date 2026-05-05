/**
 * scripts/lib/gzip-size.js
 *
 * One-line gzip-byte helper, single-sourced for every script that
 * needs to compute compressed sizes (performance-budget.js,
 * inject-doc-numbers.js, …). Accepts either a `Buffer` (bytes that
 * are already binary, e.g. from `readFileSync`) or a `string` (UTF-8
 * text, e.g. inline CSS extracted from index.html).
 *
 * Why this lives in `scripts/lib/`:
 *   Round 22 audit found `zlib.gzipSync(content).length` open-coded
 *   in two scripts plus a Buffer-coercion variant for inline-style
 *   strings. A future third caller would have copy-pasted the
 *   pattern. Consolidating here removes the drift class.
 */

import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';

/**
 * Gzip the input and return the compressed byte length. Buffer or
 * string accepted; strings are encoded as UTF-8 before compression.
 *
 * @param {Buffer | string} input
 * @returns {number} byte length of the gzipped payload
 */
export function gzipBytes(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return gzipSync(buf).length;
}
