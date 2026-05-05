/**
 * Font subset coverage test — closes the "fragile coupling" gap
 * between rendered DOM text and the literal strings that drive each
 * woff2 subset.
 *
 * Architecture before this test:
 *   - `scripts/subset-fonts-lcp.js`     subsets cinzel-700 to a hardcoded
 *     LCP text array
 *   - `scripts/subset-fonts-page.js`    subsets cinzel-600 / cinzel-700 /
 *     crimson-text-italic to hardcoded NAV / SECTION / ITALIC arrays
 *   - The actual rendered text in `index.html`
 *
 * If anyone edited an h1 / h2 / h3 / nav link / quote without
 * also adding the new characters to the subset script, the new
 * glyph would render in the fallback serif on first visit (and on
 * every subsequent visit until the SW cache evicted), with NO
 * existing test catching the regression.
 *
 * After this test:
 *   - The subset literals live in `scripts/lib/font-text-constants.js`
 *     (single source of truth, imported by both subset scripts).
 *   - This test parses `index.html` with jsdom, extracts the rendered
 *     text from every selector that uses each font face, and asserts
 *     that the matching constant in `font-text-constants.js` covers
 *     ALL the rendered characters.
 *
 * The assertion is a subset-of-glyphs relation, not string-equality:
 *   { rendered DOM chars (incl. case variants) } ⊆ { subset chars }
 *
 * A failure prints the missing characters with the offending source
 * string so the fix is "add these N characters to NAV_TEXT in
 * font-text-constants.js, then re-run npm run build:fonts:page".
 *
 * Why both case variants are included on both sides: every selector
 * we cover applies `text-transform: uppercase` (per index.html
 * structure + 4-header.css / 5-hero.css / 3-typography.css). The CSS
 * Text spec applies case conversion BEFORE shaping, so the browser
 * looks up uppercase glyphs even when the source DOM contains
 * lowercase. Bundling both cases on both sides makes the test robust
 * to (a) edits to the source DOM, (b) edits to the constant
 * literals, and (c) future selector additions where text-transform
 * may or may not be set — same comparison logic still applies.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  BODY_TEXT,
  HERO_TEXT,
  ITALIC_TEXT,
  NAV_TEXT,
  SECTION_HEADINGS_TEXT,
} from '../../scripts/lib/font-text-constants.js';

/* `__dirname` is provided by babel-jest's CJS transform — using it
   instead of `import.meta.url` avoids "Cannot use 'import.meta'
   outside a module" because jest runs each test file under a CJS
   wrapper.

   We use the in-test `DOMParser` (provided by jest-environment-jsdom)
   instead of importing `jsdom` directly. Importing the standalone
   `jsdom` package inside a test that's already running under
   jsdom-env creates two competing globals (TextEncoder, etc.) and
   crashes with "TextEncoder is not defined". The DOMParser route is
   bundled with the test environment and parses HTML to the same
   Document API. */
const ROOT = path.join(__dirname, '..', '..');

/** Returns a Set of every character in `s`, plus its lowercased and
 *  uppercased variants. Mirrors the `envelope()` helper used by the
 *  subset scripts so the comparison is symmetric on both sides. */
function chars(s) {
  const result = new Set();
  for (const c of s) result.add(c);
  for (const c of s.toLowerCase()) result.add(c);
  for (const c of s.toUpperCase()) result.add(c);
  return result;
}

/** Returns the rendered text content of every selector in `selectors`,
 *  joined and trimmed, against the parsed jsdom document. */
function renderedText(doc, selectors) {
  return selectors
    .flatMap((sel) =>
      [...doc.querySelectorAll(sel)].map((el) => el.textContent.replaceAll(/\s+/g, ' ').trim()),
    )
    .join(' ');
}

function fmtChars(set) {
  return [...set]
    .map(
      (c) =>
        `${JSON.stringify(c)} (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`,
    )
    .sort();
}

/** Asserts BIDIRECTIONAL coverage between rendered DOM text and the
 *  subset constant. Two directions, both load-bearing:
 *
 *   1. `missingFromSubset`: chars in DOM but NOT in constant. Pure-bug
 *      direction — a glyph is rendered but the subset font doesn't
 *      ship it, so it falls back to system serif. This is what the
 *      original test caught.
 *
 *   2. `extraInSubset`: chars in constant but NOT in DOM. Drift
 *      direction — the constant claims to need a glyph that nothing
 *      on the page actually renders. Costs bytes (the subsetter still
 *      embeds the glyph if the source font ships it) and lies about
 *      what the subset is for. Caught a real bug: `dall’Oscurità`
 *      with curly U+2019 in ITALIC_TEXT vs `dall'Oscurità` with
 *      ASCII U+0027 in the HTML — the subset font silently dropped
 *      the curly because the source Latin-Extended-A subset doesn't
 *      include U+2019 anyway, and the constants file misled the
 *      maintainer about what gets rendered.
 *
 *  The structured-object assertion (vs bare `expect(set).toEqual(empty)`)
 *  prints BOTH directions in jest's diff alongside the labels — the
 *  failure tells you exactly what to add (or remove) in
 *  `font-text-constants.js`. */
function assertCoverage({ subsetLabel, subsetString, domLabel, domString }) {
  const subsetChars = chars(subsetString);
  const domChars = chars(domString);
  const missingFromSubset = fmtChars(new Set([...domChars].filter((c) => !subsetChars.has(c))));
  const extraInSubset = fmtChars(new Set([...subsetChars].filter((c) => !domChars.has(c))));
  expect({
    subsetLabel,
    domLabel,
    domSnippet: domString.slice(0, 120),
    missingFromSubset,
    extraInSubset,
    fix:
      'see jest diff above. `missingFromSubset` → append to the matching ' +
      'constant in scripts/lib/font-text-constants.js. `extraInSubset` → ' +
      'either remove from the constant or add the matching text to ' +
      'index.html. Then re-run `npm run build:fonts:lcp` and ' +
      '`npm run build:fonts:page`.',
  }).toEqual({
    subsetLabel,
    domLabel,
    domSnippet: domString.slice(0, 120),
    missingFromSubset: [],
    extraInSubset: [],
    fix:
      'see jest diff above. `missingFromSubset` → append to the matching ' +
      'constant in scripts/lib/font-text-constants.js. `extraInSubset` → ' +
      'either remove from the constant or add the matching text to ' +
      'index.html. Then re-run `npm run build:fonts:lcp` and ' +
      '`npm run build:fonts:page`.',
  });
}

describe('font subset coverage — DOM ⊆ font-text-constants.js', () => {
  let doc;

  beforeAll(() => {
    const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    /* DOMParser comes from jest-environment-jsdom — no script
       execution, just HTML → Document. Critical: this also parses
       the inline `<style>` block as a CSSStyleElement, but we only
       query against semantic selectors (`.hero h1`, etc.) which
       don't traverse stylesheets. */
    doc = new DOMParser().parseFromString(html, 'text/html');
  });

  test('HERO_TEXT covers .hero h1 / .hero-subtitle / .skip-link-header / .header-title', () => {
    const domString = renderedText(doc, [
      '.hero h1',
      '.hero-subtitle',
      '.skip-link-header',
      '.header-title',
    ]);
    assertCoverage({
      subsetLabel: 'HERO_TEXT (used by Cinzel LCP and full Cinzel-700 fallback)',
      subsetString: HERO_TEXT,
      domLabel: '.hero h1, .hero-subtitle, .skip-link-header, .header-title',
      domString,
    });
  });

  test('NAV_TEXT covers nav a (= section h2 source text)', () => {
    /* Source DOM identical for nav links and section h2s — both list
       the three "Origine e Identità / Obiettivo e Organizzazione /
       Usi e Costumi" items. nav links use Cinzel-600; h2s use the
       full Cinzel-700 (which also receives NAV_TEXT via
       SECTION_HEADINGS_TEXT in subset-fonts-page.js). */
    const domString = renderedText(doc, ['nav a', '.section h2']);
    assertCoverage({
      subsetLabel: 'NAV_TEXT (used by Cinzel-600 and full Cinzel-700)',
      subsetString: NAV_TEXT,
      domLabel: 'nav a + .section h2',
      domString,
    });
  });

  test('SECTION_HEADINGS_TEXT covers .section h3 + every <strong> in body', () => {
    /* h3 elements + <strong> elements use Cinzel-700 weight (the body
       text inherits cinzel via --font-serif and CSS rules apply
       weight 700 to .section strong / footer strong). */
    const domString = renderedText(doc, ['.section h3', 'main strong', 'footer strong']);
    assertCoverage({
      subsetLabel: 'SECTION_HEADINGS_TEXT (used by full Cinzel-700)',
      subsetString: SECTION_HEADINGS_TEXT,
      domLabel: '.section h3 + main strong + footer strong',
      domString,
    });
  });

  test('ITALIC_TEXT covers .hero-tagline + .quote-liberty', () => {
    const domString = renderedText(doc, ['.hero-tagline', '.quote-liberty']);
    assertCoverage({
      subsetLabel: 'ITALIC_TEXT (used by Crimson Text italic)',
      subsetString: ITALIC_TEXT,
      domLabel: '.hero-tagline + .quote-liberty',
      domString,
    });
  });

  test('BODY_TEXT covers .section p + footer p (excluding pull-quote / tagline)', () => {
    /* Cinzel weight 400 is shipped specifically so body paragraphs
       render in Cinzel rather than fuzzy-matching to Cinzel-600
       (NAV-only subset → macedonia rendering for body chars outside
       NAV). The subset MUST cover every char any body paragraph
       renders. We exclude `.quote-liberty` (Crimson italic) and the
       hero subtitle/tagline (different families) from the DOM side
       so the coverage check stays scoped to what `cinzel-400` is for. */
    const domString = renderedText(doc, ['.section p:not(.quote-liberty)', 'footer p']);
    assertCoverage({
      subsetLabel: 'BODY_TEXT (used by Cinzel weight 400)',
      subsetString: BODY_TEXT,
      domLabel: '.section p:not(.quote-liberty) + footer p',
      domString,
    });
  });

  /* Sanity: a future refactor that breaks the lib export shape
     (e.g. accidentally exporting `undefined` or an array instead of
     a string) would crash subset-font silently. Pin the contract
     here so it's caught at unit-test time rather than at
     `npm run build:fonts:page` time.
     `test.each` gives one failure per constant so the offending
     export is named in the report — vs a single `for` loop where the
     first failure halts iteration. */
  test.each([
    ['HERO_TEXT', () => HERO_TEXT],
    ['NAV_TEXT', () => NAV_TEXT],
    ['SECTION_HEADINGS_TEXT', () => SECTION_HEADINGS_TEXT],
    ['ITALIC_TEXT', () => ITALIC_TEXT],
    ['BODY_TEXT', () => BODY_TEXT],
  ])('%s is a non-empty single-line string', (_label, getValue) => {
    const value = getValue();
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
    /* No newlines / control chars — the subsetter accepts them but
       they'd suggest a copy-paste error from a multi-line source. */
    expect(value).not.toMatch(/[\r\n\t\0]/);
  });
});
