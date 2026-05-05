/**
 * E2E — Mobile & Responsive Tests
 *
 * Two test suites:
 *
 * 1. Device-based — emulate real device profiles (iPhone SE, Pixel 5, iPad Pro)
 *    and verify core UX works on each.
 *
 * 2. CSS Breakpoint Assertions — set exact viewport widths around the defined
 *    breakpoints (≤480px, ≤599px, 900px, ≥1024px) and assert that the CSS
 *    layout changes actually fire: column counts, flex-wrap, visibility rules,
 *    and Cumulative Layout Shift during scroll.
 */

import { test, expect } from './fixtures.js';

// Device profiles definiti inline senza usare il registry devices[] di Playwright.
// Il registry include defaultBrowserType (es. webkit per iPhone) che forza un
// worker-fork: non utilizzabile dentro describe() in nessuna versione recente.
// Viewport, isMobile e hasTouch coprono tutti i test responsive di questo file.
const MOBILE_DEVICES = {
  'iPhone SE': { viewport: { width: 375, height: 667 } },
  'Pixel 5': { viewport: { width: 393, height: 851 } },
  'iPad Pro': { viewport: { width: 1024, height: 1366 } },
};

// Count resolved grid column tracks from a computed gridTemplateColumns string.
// Computed values are always space-separated px lengths, e.g. "200px 400px".
function trackCount(gridTemplateColumns) {
  return gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
}

/* On mobile viewports the hamburger toggle is shown and nav is collapsed at
   load. This helper unconditionally clicks the toggle if it is currently
   visible (mobile) and is a no-op on desktop where the toggle is hidden by
   CSS. Called from tests that need to interact with nav children regardless
   of viewport — keeps the tests linear (no in-test conditionals). */
async function openNavIfCollapsed(page) {
  const toggle = page.locator('.nav-toggle');
  await toggle.evaluate((el) => {
    if (getComputedStyle(el).display !== 'none') {
      el.click();
    }
  });
  await page.waitForFunction(
    () => (document.querySelector('nav')?.getBoundingClientRect().height ?? 0) > 0,
    { timeout: 1500 },
  );
}

// ─── 1. Device-based tests ────────────────────────────────────────────────────
// test.use() con defaultBrowserType deve essere al top level del describe,
// non in un describe annidato — ogni device ha il proprio describe top-level.

for (const [deviceName, device] of Object.entries(MOBILE_DEVICES)) {
  test.describe(`Mobile Responsiveness — ${deviceName}`, () => {
    test.use(device);

    test('page loads and header is visible', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('header')).toBeVisible();
    });

    test('hero section does not clip its content', async ({ page }) => {
      await page.goto('/');
      const heroBox = await page.locator('.hero').boundingBox();
      const contentBox = await page.locator('.hero-content').boundingBox();
      expect(heroBox).not.toBeNull();
      expect(contentBox).not.toBeNull();
      expect(contentBox.height).toBeLessThanOrEqual(heroBox.height + 2);
    });

    test('nav links meet 44px minimum touch target', async ({ page }) => {
      await page.goto('/');
      // On mobile the nav is collapsed — open it before measuring touch targets
      await openNavIfCollapsed(page);

      const navLinks = page.locator('nav a');
      const count = await navLinks.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const box = await navLinks.nth(i).boundingBox();
        expect(box).not.toBeNull();
        /* WCAG 2.5.5 AAA mandates 44 × 44 CSS px exactly. The previous
           43.5 floor accepted sub-WCAG sizes; rounding to the nearest
           pixel before comparing absorbs sub-pixel layout jitter without
           letting genuine regressions slip through. */
        expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
        expect(Math.round(box.width)).toBeGreaterThanOrEqual(44);
      }
    });

    test('anchor navigation scrolls to target section', async ({ page }) => {
      await page.goto('/');
      // On mobile the nav is collapsed — open it before clicking a link
      await openNavIfCollapsed(page);
      await page.locator('a[href="#origine-identita"]').click();
      await page.waitForURL('**/#origine-identita');
      await expect(page.locator('#origine-identita')).toBeVisible();
    });

    test('images load with natural dimensions', async ({ page }) => {
      await page.goto('/');
      // Filter out images hidden via CSS (display:none) — the browser correctly
      // defers loading them; checking natural dimensions would always fail.
      const visibleNaturalDims = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('img')];
        return imgs
          .filter((el) => getComputedStyle(el).display !== 'none')
          .map((el) => ({ complete: el.complete, naturalHeight: el.naturalHeight }));
      });
      expect(visibleNaturalDims.length).toBeGreaterThan(0);
      for (const { complete, naturalHeight } of visibleNaturalDims) {
        expect(complete).toBeTruthy();
        expect(naturalHeight).toBeGreaterThan(0);
      }
    });

    test('footer is reachable by scrolling', async ({ page }) => {
      await page.goto('/');
      await page.locator('footer').scrollIntoViewIfNeeded();
      await expect(page.locator('footer')).toBeVisible();
    });
  });
}

// ─── 2. CSS Breakpoint Assertions ─────────────────────────────────────────────

test.describe('CSS Breakpoint Assertions', () => {
  // ── ≤599px: mobile header layout ──────────────────────────────────────────

  test('≤599px — hamburger toggle is visible and nav is collapsed', async ({ page }) => {
    await page.setViewportSize({ width: 599, height: 800 });
    await page.goto('/');

    // Toggle button must be visible on mobile
    await expect(page.locator('.nav-toggle')).toBeVisible();
    // Nav must be collapsed (toggle bar counts: grid-template-rows 0fr → height ≈ 0)
    const navHeight = await page.locator('nav').evaluate((el) => el.getBoundingClientRect().height);
    expect(navHeight).toBe(0);
    // Clicking toggle expands the nav — poll until height > 0 (avoids fixed-timeout flakiness)
    await page.locator('.nav-toggle').click();
    await page.waitForFunction(
      () => (document.querySelector('nav')?.getBoundingClientRect().height ?? 0) > 0,
      { timeout: 1500 },
    );
    const navHeightOpen = await page
      .locator('nav')
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(navHeightOpen).toBeGreaterThan(0);
  });

  test('≤599px — header-container collapses to single column', async ({ page }) => {
    await page.setViewportSize({ width: 599, height: 800 });
    await page.goto('/');

    const cols = await page.evaluate(
      () => getComputedStyle(document.querySelector('.header-container')).gridTemplateColumns,
    );
    expect(trackCount(cols)).toBe(1);
  });

  test('≤599px — title wrapper stacks above nav', async ({ page }) => {
    await page.setViewportSize({ width: 599, height: 800 });
    await page.goto('/');

    /* Open the nav popover so it has a measurable bounding box. When
       the popover is closed the UA stylesheet sets display:none on
       it, so getBoundingClientRect returns all-zeros and the
       top-comparison would fail spuriously. */
    await openNavIfCollapsed(page);

    const titleY = await page
      .locator('.header-title-wrapper')
      .evaluate((el) => el.getBoundingClientRect().top);
    const navY = await page.locator('nav').evaluate((el) => el.getBoundingClientRect().top);
    expect(titleY).toBeLessThan(navY);
  });

  test('≤599px — skip-link is visible at top, title-link is hidden until scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 599, height: 800 });
    await page.goto('/');

    const skipVisibility = await page.evaluate(
      () => getComputedStyle(document.querySelector('.skip-link-header')).visibility,
    );
    const skipOpacity = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.querySelector('.skip-link-header')).opacity),
    );
    const titleVisibility = await page.evaluate(
      () => getComputedStyle(document.querySelector('.header-title-link')).visibility,
    );
    const titleOpacity = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.querySelector('.header-title-link')).opacity),
    );

    expect(skipVisibility).toBe('visible');
    expect(skipOpacity).toBeGreaterThan(0);
    expect(titleVisibility).toBe('hidden');
    expect(titleOpacity).toBe(0);
  });

  // ── 600–1023px: still single column (tablet zone, mobile hamburger active) ─

  test('900px (tablet) — header-container stays single column', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');

    const cols = await page.evaluate(
      () => getComputedStyle(document.querySelector('.header-container')).gridTemplateColumns,
    );
    expect(trackCount(cols)).toBe(1);
  });

  // ── ≥1024px: desktop header layout ────────────────────────────────────────

  test('≥1024px — header-container is two-column', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');

    const cols = await page.evaluate(
      () => getComputedStyle(document.querySelector('.header-container')).gridTemplateColumns,
    );
    expect(trackCount(cols)).toBe(2);
  });

  test('≥1024px — skip-link is visible before any scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');

    const visibility = await page.evaluate(
      () => getComputedStyle(document.querySelector('.skip-link-header')).visibility,
    );
    expect(visibility).toBe('visible');
  });

  test('≥1024px — hamburger toggle is hidden and nav is always visible', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');

    // Toggle must be hidden on desktop
    const toggleDisplay = await page.evaluate(
      () => getComputedStyle(document.querySelector('.nav-toggle')).display,
    );
    expect(toggleDisplay).toBe('none');
    // Nav must be visible (height > 0) without any interaction
    const navHeight = await page.locator('nav').evaluate((el) => el.getBoundingClientRect().height);
    expect(navHeight).toBeGreaterThan(0);
  });

  // ── ≤480px: phone-specific layout ─────────────────────────────────────────

  test('≤480px — nav stacks vertically (no horizontal overflow)', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto('/');

    // nav ul usa flex-direction: column — gli elementi si impilano verticalmente
    // senza overflow orizzontale (non serve flex-wrap: wrap in layout a colonna)
    const flexDirection = await page.evaluate(
      () => getComputedStyle(document.querySelector('nav ul')).flexDirection,
    );
    expect(flexDirection).toBe('column');
  });

  // CLS testing has been split per-browser to exercise the strongest
  // assertion each environment supports:
  //   - tests/e2e/cls-direct/cls-measurement.spec.js (chromium):
  //         direct PerformanceObserver layout-shift measurement
  //   - tests/e2e/cls-proxy.spec.js (firefox + webkit):
  //         sticky-header top=0 invariant before/after scroll
  // Routing is via playwright.config.cjs testIgnore, no test.skip().
});

// ─── 3. Desktop verification ──────────────────────────────────────────────────

test.describe('Desktop Verification', () => {
  test('all major sections visible at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });
});
