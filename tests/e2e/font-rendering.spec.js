import { test, expect } from './fixtures.js';

/**
 * Body-paragraph font fidelity test.
 *
 * Bug history (Apr 2026):
 *
 * 1. **Macedonia rendering** — Cinzel-600 was deferred and text-subset
 *    to NAV glyphs only. Body weight 400 fuzzy-matched to Cinzel-600
 *    and produced mixed glyphs (Cinzel for nav letters, fallback serif
 *    for everything else).
 *
 * 2. **Body-in-fallback-serif** — intermediate fix set body's
 *    `font-family` to plain `serif` to escape the macedonia. Body
 *    rendered in system serif, visually inconsistent with the Cinzel
 *    headings.
 *
 * Final fix: cinzel-400 @font-face is declared in CRITICAL fonts.css
 * (not deferred) AND its woff2 is preloaded — so the font face exists
 * before body's first paint and `font-display: optional` accepts it
 * inside the 100 ms block period. Body now renders in Cinzel weight
 * 400 from first paint.
 *
 * This test pins the design intent at the CSS layer:
 *   - body / `.section p` / `footer p` font-family MUST start with
 *     `cinzel`. A future refactor that drops cinzel from body
 *     (regression #2) fails here.
 *
 * The data-layer companion lives in
 * `tests/unit/font-subset-coverage.test.js`: that test verifies that
 * `BODY_TEXT` (the literal that drives the cinzel-400 subset) covers
 * every char that the rendered DOM contains in body / footer
 * paragraphs. Together the two tests catch:
 *   (a) wrong font-family on body → caught at the CSS-computed
 *       layer here;
 *   (b) cinzel-400 subset missing a glyph that the DOM actually
 *       renders → caught at the data layer in jest;
 *   (c) macedonia (cinzel-600 fuzzy-match) → caught here because the
 *       fix requires `body { font-family: cinzel, serif }` AND the
 *       jest test ensures Cinzel-400 has the chars Cinzel-600 lacks.
 *
 * What this test deliberately does NOT do: probe-width comparisons
 * against monospace/serif. Those are unreliable across browsers
 * (Cinzel and monospace can have near-identical widths for narrow
 * letters like 'l' / 'i' / 't', and font-display: optional can
 * reject the face for dynamically-created probe elements while
 * still applying it to the rendered body — visible discrepancy
 * between probe and body in Firefox under Playwright).
 */
test.describe('Body-paragraph font fidelity (Cinzel applied, no macedonia)', () => {
  test('body / .section p / footer p computed font-family STARTS with cinzel', async ({
    page,
    home,
  }) => {
    await home.open();
    await page.waitForLoadState('load');
    await page.evaluate(() => document.fonts.ready);

    const families = await page.evaluate(() => ({
      body: getComputedStyle(document.body).fontFamily,
      sectionP: getComputedStyle(document.querySelector('.section p')).fontFamily,
      footerP: getComputedStyle(document.querySelector('footer p')).fontFamily,
    }));

    /* Computed value of `cinzel, serif` is `cinzel, serif` (Chromium /
       Webkit may quote multi-word identifiers; Firefox doesn't).
       Case-insensitive prefix match catches every variant. The first
       family must be cinzel — anything else means a refactor changed
       the design intent (body should display in Cinzel after the
       Apr 2026 fix). */
    for (const [label, family] of Object.entries(families)) {
      expect(family.toLowerCase(), `${label} font-family must start with cinzel`).toMatch(
        /^["']?cinzel/,
      );
      expect(family.toLowerCase(), `${label} fallback chain must end in serif`).toContain('serif');
    }
  });
});
