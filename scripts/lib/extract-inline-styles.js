/**
 * scripts/lib/extract-inline-styles.js
 *
 * Extract every inline `<style>...</style>` block body from an HTML
 * string. Returns a list of bodies (CSS contents only, without the
 * surrounding tags) plus a count of matched blocks.
 *
 * Why this lives in `scripts/lib/`:
 *   Round 20 had three near-identical regex extractors —
 *     - `cache-bust.js#L93`     (composite hash includes inline CSS)
 *     - `performance-budget.js#L74`  (inline CSS in CSS budget total)
 *     - `size-report.js#L43`    (raw KB of inline CSS for console)
 *   Each handled the multi-block edge case slightly differently.
 *   Round-21 audit flagged the duplication; this single extractor
 *   pins ONE non-greedy regex, ONE multi-match collection, ONE
 *   contract callers compose into their domain logic.
 *
 * Why a function and not a constant:
 *   Some callers (e.g. cache-bust.js) need the LIST of bodies
 *   (to feed each through the composite-hash chain in order).
 *   Others (performance-budget.js) want the JOINED string so the
 *   gzip computation runs once. Returning the list keeps both
 *   fluent: `bodies.join('')` for the joined case,
 *   `bodies.forEach(...)` for the per-block case.
 *
 * Why not just `html.matchAll(/.../)` inline at each call-site:
 *   Three regex copies = three places to update if the tag-shape
 *   ever changes (e.g. `<style nonce="...">` lands when CSP nonces
 *   replace hashes). One regex = one update site.
 */

/* Non-greedy `[\s\S]*?` so multiple `<style>` blocks in the same
   document are extracted independently — a greedy match would
   span from the first `<style>` to the LAST `</style>`. The
   `[^>]*` after `<style` allows attributes (e.g. `<style nonce>`)
   without expanding the body capture. */
const INLINE_STYLE_RE = /<style[^>]*>([\s\S]*?)<\/style>/g;

/**
 * @param {string} html — full HTML document text
 * @returns {string[]} — array of inline-CSS bodies (one per
 *   `<style>` block); empty array when the document has no inline
 *   styles.
 */
export function extractInlineStyles(html) {
  return [...html.matchAll(INLINE_STYLE_RE)].map((m) => m[1]);
}
