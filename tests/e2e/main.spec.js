/**
 * End-to-End Tests for La Compagnia della Ghironda
 * Tests user flows, interactions, and page functionality.
 */

import { test, expect } from './fixtures.js';

// ─── Page Loading and Rendering ───────────────────────────────────────────────

test.describe('Page Loading and Rendering', () => {
  test('should load with the correct page title', async ({ home }) => {
    await home.open();
    expect(await home.page.title()).toBe('La Compagnia della Ghironda - The Miracle Shard');
  });

  test('should render without JavaScript errors', async ({ home }) => {
    const errors = [];
    home.page.on('pageerror', (err) => errors.push(err.message));
    await home.open();
    expect(errors).toHaveLength(0);
  });

  test('should render header, main and footer', async ({ home }) => {
    await home.open();
    /* Role-based locators via fixture: `banner` is the implicit role of
       <header>, `main` of <main>, `contentinfo` of <footer>. CSS class
       drift cannot break this. */
    await expect(home.page.getByRole('banner')).toBeVisible();
    await expect(home.page.getByRole('main')).toBeVisible();
    await expect(home.page.getByRole('contentinfo')).toBeVisible();
  });

  test('should render the SVG topography rings as hero ::after background', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    // I cerchi topografici sono renderizzati come `::after` di .hero
    // (anchor a livello hero) — così restano visibili anche quando il
    // .ghironda-wrapper viene nascosto in viewport ridotti / nav aperto,
    // mantenendo l'hero ancorato visivamente.
    const hero = page.locator('.hero');
    await expect(hero).toBeVisible();
    const afterBg = await hero.evaluate((el) => getComputedStyle(el, '::after').backgroundImage);
    expect(afterBg).toContain('ghironda-rings.svg');
  });
});

// ─── Navigation and Scrolling ─────────────────────────────────────────────────

test.describe('Navigation and Scrolling', () => {
  test('should expose all 3 navigation links via the role-based fixture', async ({ home }) => {
    await home.open();
    /* Role-based: `home.navLinks` is `nav.getByRole('link')` from
       fixtures.js — pinned to 3 (the documented section count). A
       mutant that drops a section anchor breaks this assertion
       precisely; `> 0` would have survived dropping 2 of 3. */
    await expect(home.navLinks).toHaveCount(3);
  });

  test('should bring the target section into view when a nav link is clicked', async ({ page }) => {
    await page.goto('/');

    // Section with id is required for the test to be meaningful — assert it
    // unconditionally so absence is treated as a regression, not skipped.
    const firstSection = page.locator('section[id]').first();
    await expect(firstSection).toBeAttached();
    const sectionId = await firstSection.getAttribute('id');
    const navLink = page.locator(`a[href="#${sectionId}"]`).first();
    await expect(navLink).toBeAttached();

    // Scroll away from the section first so the click has observable effect
    await page.evaluate(() => window.scrollTo(0, 0));
    await navLink.click();
    await expect(firstSection).toBeInViewport({ timeout: 2000 });
  });

  test('header title-link click cross-fades back to skip-link and scrolls to hero', async ({
    page,
  }) => {
    /* Regression guard for the round-23 bug where `.hero { overflow: hidden }`
       silently established a scroll container, pinning the hero h1's
       view-timeline source to a non-scrollable box. Result: the cross-fade
       keyed off `--hero-h1` froze, the title-link stayed at opacity 0
       even after scrolling, and clicking it never produced an observable
       state change (because the title-link itself was never visible to
       click). The fix swaps `overflow: hidden` for `overflow: clip` on
       `.hero` (with `overflow: hidden` as a Safari ≤15 fallback), which
       clips identically without creating a scroll container. This test
       pins both halves: (a) the title becomes visible after scroll, (b)
       the click triggers the inverse cross-fade and lands the user at
       the top of the page. */
    await page.goto('/');
    await page.waitForLoadState('load');
    await page.setViewportSize({ width: 1280, height: 720 });

    /* Scroll past the hero so the cross-fade should show the title.
       The fade is driven by a CSS scroll-driven animation on engines
       that support `animation-timeline: view()` (modern path) or by
       `js/modules/header-toggle.js` toggling `body.is-scrolled-past-hero`
       on engines that don't (legacy path). Either way the observable
       end-state is identical: opacity ≈ 1 on the title-link. */
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForFunction(
      () => {
        const link = document.querySelector('.header-title-link');
        return link && Number.parseFloat(getComputedStyle(link).opacity) > 0.95;
      },
      null,
      { timeout: 5000 },
    );

    /* Click the now-visible title and assert two contracts:
       1. scrollY lands at exactly 0 — `href="#top"` is the HTML-spec
          fragment that scrolls to the document top (the aria-label
          says "torna all'inizio"). A naive `href="#hero-heading"`
          would land at scrollY≈55 instead, because the h1 sits
          ~132px below the document top while scroll-padding-top
          reserves only 77px for the sticky header. The strict `=== 0`
          assertion catches any future regression to a non-top target.
       2. The cross-fade reverses — skip-link reclaims the slot at
          full opacity, title-link goes back to opacity 0. */
    await page.locator('.header-title-link').click();
    await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 2000 });
    await page.waitForFunction(
      () => {
        const skip = document.querySelector('.skip-link-header');
        return skip && Number.parseFloat(getComputedStyle(skip).opacity) > 0.95;
      },
      null,
      { timeout: 2000 },
    );

    const finalState = await page.evaluate(() => ({
      scrollY: window.scrollY,
      title: Number.parseFloat(
        getComputedStyle(document.querySelector('.header-title-link')).opacity,
      ),
      skip: Number.parseFloat(
        getComputedStyle(document.querySelector('.skip-link-header')).opacity,
      ),
    }));
    expect(finalState.scrollY).toBe(0);
    expect(finalState.title).toBeLessThan(0.05);
    expect(finalState.skip).toBeGreaterThan(0.95);
  });

  /* Level B (April 2026) removed the JS-driven `aria-current="location"`
     attribute — the active-section nav highlight is now a pure CSS
     scroll-driven animation (view-timeline + animation-range, see
     css/4-header.css `@supports (animation-timeline: view())`). This
     trade-off is documented in CHANGELOG.md / ARCHITECTURE.md as an
     accepted a11y regression (screen readers no longer announce "current
     location" on the nav links). Visual correctness of the active-section
     highlight is covered by tests/e2e/visual.spec.js — there is no
     attribute to assert here, so the previous test was deleted. */
  test('active-section nav highlight respects @supports gate (chromium/webkit → accent-gold, firefox → fallback)', async ({
    page,
    browserName,
  }) => {
    /* Engine support matrix as of Apr 2026 — runs on every browser; no
       skip. Asserting BOTH branches (engines with view-timeline →
       highlight, engines without → graceful fallback) means a
       regression in EITHER path fails this test instead of going
       silently green:

         - Chromium 115+: `@supports (animation-timeline: view())`
           gates a keyframe that flips `nav a` to
           `var(--color-accent-gold)` (#d4b896 → rgb(212, 184, 150))
           while the section is centred in the viewport. (Round-23
           changed the highlight from flame-red to accent-gold so
           the active state matches the hover/focus colour and stays
           coherent with the gold-warm header palette across
           browsers.)
         - WebKit (Playwright current trunk): also applies the
           keyframe — Safari 26+ shipped scroll-driven view-timeline
           by default and Playwright's WebKit build picks it up.
         - Firefox 134+: spec-supports view-timeline, but Playwright's
           bundled Firefox build does NOT enable scroll-driven
           animations by default — the keyframe is never applied.
           Firefox falls through to the default
           `var(--color-nav-link)` (#f0e4c8 → rgb(240, 228, 200)).

       Pinning the per-browser expected colour catches:
         (a) the @supports rule accidentally applying on a browser
             where view-timeline isn't actually wired up
         (b) a token rename of either --color-accent-gold or
             --color-nav-link
         (c) the keyframe range being misconfigured so the link never
             enters the highlighted state on engines that DO support
             view-timeline.
         (d) WebKit/Firefox flipping their support state (e.g. a
             future Playwright bump that enables/disables the feature
             — the test fails loudly so we re-evaluate the matrix).

       Implementation note: a single `expect()` with a computed
       expected value (NOT an `if` around the assertion) keeps
       eslint-plugin-playwright/no-conditional-expect happy. */
    await page.goto('/');
    await page.waitForLoadState('load');

    /* Scroll the second section into the cover 30%–70% range — the
       keyframe is `from, to` (constant) so the active style applies any
       time the timeline progress is inside the animation-range. */
    const target = page.locator('section[id]').nth(1);
    await target.scrollIntoViewIfNeeded();
    /* Two rAF cycles flush the scroll-driven animation onto the next
       paint without a fixed-duration sleep (playwright/no-wait-for-timeout). */
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );

    const sectionId = await target.getAttribute('id');
    const navLink = page.locator(`nav a[href="#${sectionId}"]`);
    const colour = await navLink.evaluate((el) => getComputedStyle(el).color);

    const HIGHLIGHTED = 'rgb(212, 184, 150)'; /* --color-accent-gold */
    const FALLBACK = 'rgb(240, 228, 200)'; /* --color-nav-link */

    /* Round-23 regression guard. The previous CSS used
       `animation-fill-mode: both`, which extended the keyframe value
       backwards/forwards beyond `animation-range`, leaving EVERY nav
       link permanently highlighted on engines that support
       animation-timeline — a visible inconsistency with Firefox's
       fallback (which only differentiates the active section).
       The contract pinned here is uniform across every engine: the
       two NON-centred links are always at the fallback colour. On
       Chromium / WebKit this means "highlight is confined to the
       active section". On Firefox (without animation-timeline) every
       link including the active one is at the fallback — the non-
       centred ones still match, so the assertion is tautological
       there but stays true. No conditional needed in the test. */
    const otherSections = await page.locator('section[id]').all();
    const otherIds = await Promise.all(otherSections.map((s) => s.getAttribute('id')));
    const inactiveIds = otherIds.filter((id) => id !== sectionId);
    const inactiveColours = await Promise.all(
      inactiveIds.map((id) =>
        page.locator(`nav a[href="#${id}"]`).evaluate((el) => getComputedStyle(el).color),
      ),
    );
    expect(inactiveColours.every((c) => c === FALLBACK)).toBe(true);
    /* Per-browser expected value — see matrix in the test docstring.
       Encoded as a lookup table (NOT a ternary) so
       playwright/no-conditional-in-test stays satisfied: there is no
       branch in the test body, just a deterministic key→value map. */
    const EXPECTED_BY_BROWSER = {
      chromium: HIGHLIGHTED,
      webkit: HIGHLIGHTED,
      firefox: FALLBACK,
    };
    expect(colour).toBe(EXPECTED_BY_BROWSER[browserName]);
  });
});

// ─── Keyboard navigation tests live in separate files per browser ─────────────
// - tests/e2e/keyboard/tab-navigation.spec.js  → real keyboard.press('Tab') (chromium + firefox)
// - tests/e2e/keyboard.webkit.spec.js          → focus-based fallback (webkit)
// playwright.config.cjs uses testIgnore to route them to the right project.
// Universal focus-style assertions remain here:

test.describe('Focus styling', () => {
  test('focused link shows a visible (non-zero, non-transparent) focus indicator', async ({
    page,
  }) => {
    await page.goto('/');
    const link = page.locator('a').first();
    await link.focus();

    /* Returns the resolved focus-ring properties so we can assert each
       dimension separately. The previous `outline !== 'none' && outline !==
       ''` test would have passed for `outline: 0px solid transparent` —
       a perfect-looking computed style with zero visual presence. */
    const focusRing = await link.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const widthPx = Number.parseFloat(styles.outlineWidth) || 0;
      const colour = styles.outlineColor;
      const isTransparent =
        colour === 'transparent' ||
        /^rgba?\([^)]*,\s*0\s*\)$/.test(colour) ||
        /^rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(colour);
      return {
        focusVisible: el.matches(':focus-visible'),
        outlineWidth: widthPx,
        outlineStyle: styles.outlineStyle,
        outlineTransparent: isTransparent,
      };
    });

    expect(focusRing.focusVisible).toBe(true);
    expect(focusRing.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(focusRing.outlineStyle).not.toBe('none');
    expect(focusRing.outlineTransparent).toBe(false);
  });

  test('page exposes focusable navigation elements', async ({ page }) => {
    await page.goto('/');
    const focusable = await page
      .locator('a, button, input, textarea, select, [tabindex="0"]')
      .count();
    /* The page has 1 skip-link + 3 nav anchors + 1 nav-toggle checkbox
       (visually-hidden but focusable, wraps the hamburger label) + 1
       footer link = 6 minimum. A mutant that drops one to 5 still passes
       `>= 4` but not `>= 6`. */
    expect(focusable).toBeGreaterThanOrEqual(6);
  });
});

// ─── Responsive Design ────────────────────────────────────────────────────────

test.describe('Responsive Design', () => {
  test('should display header on mobile (375×667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  });

  test('should display main content on tablet (768×1024)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
  });

  test('should display footer on desktop (1920×1080)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await expect(page.locator('footer')).toBeVisible();
  });

  test('should keep body visible after orientation change', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForFunction(() => document.body.getBoundingClientRect().width > 0);
    await expect(page.locator('body')).toBeVisible();
  });
});

// ─── CSS and Styling ──────────────────────────────────────────────────────────

test.describe('CSS and Styling', () => {
  test('should set --header-h to a pixel value', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    // Il CSS custom property è --header-h (non --header-height)
    const value = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--header-h').trim(),
    );

    // Must be a non-zero pixel value like "76px"
    expect(value).toMatch(/^\d+px$/);
    expect(Number.parseInt(value)).toBeGreaterThan(0);
  });

  // ─── Design-token coverage ────────────────────────────────────────────────
  // All 12 --color-* tokens must resolve to the canonical brand values;
  // a single failure dumps the full diff instead of just the first mismatch.
  test('design-token palette resolves to canonical brand values', async ({ page }) => {
    await page.goto('/');

    const expected = {
      '--color-night': '#0f0a1a',
      '--color-gold': '#9d7e1a',
      '--color-accent-gold': '#d4b896',
      '--color-gipsy-red': '#a73a3a',
      '--color-gipsy-green': '#4a5f2f',
      '--color-fire-orange': '#c97a3a',
      '--color-gold-vivid': '#efc966',
      '--color-flame-red': '#ff6b6b',
      '--color-text': '#e8e0d4',
      '--color-nav-link': '#f0e4c8',
      '--color-tagline': '#e8d9be',
      '--color-text-secondary': '#c4b5a0',
    };
    const tokenNames = Object.keys(expected);
    const actual = await page.evaluate((names) => {
      const styles = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map((n) => [n, styles.getPropertyValue(n).trim()]));
    }, tokenNames);

    expect(actual).toEqual(expected);
  });

  test('should render a page tall enough to require scrolling', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    // Site has multiple full-height sections — scroll height must be substantial
    expect(bodyHeight).toBeGreaterThan(500);
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test('should have exactly one h1', async ({ page }) => {
    await page.goto('/');
    const h1Count = page.locator('h1');
    await expect(h1Count).toHaveCount(1);
  });

  test('should have non-empty alt text on all images', async ({ page }) => {
    await page.goto('/');

    // aria-hidden="true" images are explicitly removed from the accessibility tree;
    // they are purely decorative and do not require descriptive alt text.
    const images = await page.locator('img:not([aria-hidden="true"])').all();
    /* Cardinality precondition: an empty list would silently pass the
       loop below. The page MUST contain at least the hero <img>. */
    expect(images.length).toBeGreaterThanOrEqual(1);
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      // alt must exist and must not be empty (decorative images use aria-hidden="true" instead)
      expect(typeof alt).toBe('string');
      expect(alt.trim().length).toBeGreaterThan(0);
    }
  });

  test('should have explicit width and height on all images (CLS prevention)', async ({ page }) => {
    await page.goto('/');

    const images = await page.locator('img').all();
    /* Same cardinality guard as the alt-text test. */
    expect(images.length).toBeGreaterThanOrEqual(1);
    for (const img of images) {
      const width = await img.getAttribute('width');
      const height = await img.getAttribute('height');
      expect(width).not.toBeNull();
      expect(height).not.toBeNull();
    }
  });

  test('should have all required semantic landmark elements', async ({ page }) => {
    await page.goto('/');
    const landmarks = await page.locator('header, nav, main, section, footer').count();
    // header + nav + main + at least 1 section + footer = at least 5
    expect(landmarks).toBeGreaterThanOrEqual(5);
  });

  test('skip link activation navigates to #main-content', async ({ page }) => {
    await page.goto('/');

    // Programmatically focus the skip link — universal across browsers
    // (the original Tab-key approach failed on WebKit/Linux CI). Once
    // focused, dispatch a click which the browser treats as activation
    // for keyboard-style anchor navigation.
    const skipLink = page.locator('a[href="#main-content"]').first();
    await skipLink.focus();
    await skipLink.click();
    await page.waitForURL('**/#main-content', { timeout: 2000 });
    expect(page.url()).toContain('#main-content');
  });
});

// ─── Meta Information ─────────────────────────────────────────────────────────

test.describe('Meta Information', () => {
  test('should have meta viewport tag', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('meta[name="viewport"]').count()).toBeGreaterThan(0);
  });

  test('should have meta description', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('meta[name="description"]').count()).toBeGreaterThan(0);
  });

  test('should have og:title meta tag', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('meta[property="og:title"]').count()).toBeGreaterThan(0);
  });
});

// ─── Performance ──────────────────────────────────────────────────────────────

test.describe('Performance', () => {
  test('page load time is well under 1.5s on a localhost dev-server', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    const loadTime = await page.evaluate(() => {
      const [nav] = performance.getEntriesByType('navigation');
      return nav ? nav.loadEventEnd - nav.startTime : null;
    });
    /* Navigation Timing has been universally available since Chrome 6 /
       Firefox 7 / Safari 8 — assert presence unconditionally. */
    expect(loadTime).not.toBeNull();
    /* 1500 ms is the realistic ceiling for a static dev-server on
       localhost. The previous 5000 ms threshold absorbed real regressions
       up to 50× the actual page-load time. Lighthouse CI is the canonical
       gate for production-realistic numbers; this test only catches the
       case where the local server has fundamentally degraded. */
    expect(loadTime).toBeLessThan(1500);
  });
});
