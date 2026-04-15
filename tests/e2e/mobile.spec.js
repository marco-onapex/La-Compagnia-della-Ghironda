/**
 * E2E — Mobile & Responsive Tests
 *
 * Two test suites:
 *
 * 1. Device-based — emulate real device profiles (iPhone SE, Pixel 5, iPad Pro)
 *    and verify core UX works on each.
 *
 * 2. CSS Breakpoint Assertions — set exact viewport widths around the defined
 *    breakpoints (≤480px, ≤599px, 700px, ≥769px) and assert that the CSS
 *    layout changes actually fire: column counts, flex-wrap, visibility rules,
 *    and Cumulative Layout Shift during scroll.
 */

import { test, expect } from '@playwright/test';

// Device profiles definiti inline senza usare il registry devices[] di Playwright.
// Il registry include defaultBrowserType (es. webkit per iPhone) che forza un
// worker-fork: non utilizzabile dentro describe() in nessuna versione recente.
// Viewport, isMobile e hasTouch coprono tutti i test responsive di questo file.
const MOBILE_DEVICES = {
  'iPhone SE': { viewport: { width: 375,  height: 667  } },
  'Pixel 5':   { viewport: { width: 393,  height: 851  } },
  'iPad Pro':  { viewport: { width: 1024, height: 1366 } },
};

// Count resolved grid column tracks from a computed gridTemplateColumns string.
// Computed values are always space-separated px lengths, e.g. "200px 400px".
function trackCount(gridTemplateColumns) {
  return gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
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
      const heroBox    = await page.locator('.hero').boundingBox();
      const contentBox = await page.locator('.hero-content').boundingBox();
      expect(contentBox).not.toBeNull();
      if (heroBox && contentBox) {
        expect(contentBox.height).toBeLessThanOrEqual(heroBox.height + 2);
      }
    });

    test('nav links meet 44px minimum touch target', async ({ page }) => {
      await page.goto('/');
      // On mobile the nav is collapsed — open it before measuring touch targets
      const toggle = page.locator('.nav-toggle');
      if (await toggle.isVisible()) {
        await toggle.click();
        await page.waitForFunction(
          () => (document.querySelector('nav')?.getBoundingClientRect().height ?? 0) > 0,
          { timeout: 1500 }
        );
      }
      const navLinks = page.locator('nav a');
      const count = await navLinks.count();
      for (let i = 0; i < count; i++) {
        const box = await navLinks.nth(i).boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          // Use 43.5 floor to tolerate sub-pixel floating-point variance across browsers
          expect(box.height).toBeGreaterThanOrEqual(43.5);
          expect(box.width).toBeGreaterThanOrEqual(43.5);
        }
      }
    });

    test('anchor navigation scrolls to target section', async ({ page }) => {
      await page.goto('/');
      // On mobile the nav is collapsed — open it before clicking a link
      const toggle = page.locator('.nav-toggle');
      if (await toggle.isVisible()) {
        await toggle.click();
        await page.waitForFunction(
          () => (document.querySelector('nav')?.getBoundingClientRect().height ?? 0) > 0,
          { timeout: 1500 }
        );
      }
      await page.locator('a[href="#origine-identita"]').click();
      await page.waitForURL('**/#origine-identita');
      await expect(page.locator('#origine-identita')).toBeVisible();
    });

    test('images load with natural dimensions', async ({ page }) => {
      await page.goto('/');
      const images = page.locator('img');
      const count = await images.count();
      for (let i = 0; i < count; i++) {
        const complete   = await images.nth(i).evaluate(el => el.complete);
        const hasNatural = await images.nth(i).evaluate(el => el.naturalHeight > 0);
        expect(complete).toBeTruthy();
        expect(hasNatural).toBeTruthy();
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
    const navHeight = await page.locator('nav').evaluate(el => el.getBoundingClientRect().height);
    expect(navHeight).toBe(0);
    // Clicking toggle expands the nav — poll until height > 0 (avoids fixed-timeout flakiness)
    await page.locator('.nav-toggle').click();
    await page.waitForFunction(
      () => (document.querySelector('nav')?.getBoundingClientRect().height ?? 0) > 0,
      { timeout: 1500 }
    );
    const navHeightOpen = await page.locator('nav').evaluate(el => el.getBoundingClientRect().height);
    expect(navHeightOpen).toBeGreaterThan(0);
  });

  test('≤599px — header-container collapses to single column', async ({ page }) => {
    await page.setViewportSize({ width: 599, height: 800 });
    await page.goto('/');

    const cols = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.header-container')).gridTemplateColumns
    );
    expect(trackCount(cols)).toBe(1);
  });

  test('≤599px — title wrapper stacks above nav', async ({ page }) => {
    await page.setViewportSize({ width: 599, height: 800 });
    await page.goto('/');

    const titleY = await page.locator('.header-title-wrapper').evaluate(el => el.getBoundingClientRect().top);
    const navY   = await page.locator('nav').evaluate(el => el.getBoundingClientRect().top);
    expect(titleY).toBeLessThan(navY);
  });

  test('≤599px — skip-link is visible at top, title-link is hidden until scroll', async ({ page }) => {
    await page.setViewportSize({ width: 599, height: 800 });
    await page.goto('/');

    const skipVisibility  = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.skip-link-header')).visibility
    );
    const skipOpacity     = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.skip-link-header')).opacity)
    );
    const titleVisibility = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.header-title-link')).visibility
    );
    const titleOpacity    = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.header-title-link')).opacity)
    );

    expect(skipVisibility).toBe('visible');
    expect(skipOpacity).toBeGreaterThan(0);
    expect(titleVisibility).toBe('hidden');
    expect(titleOpacity).toBe(0);
  });

  test('≤599px — cards grid is single column', async ({ page }) => {
    await page.setViewportSize({ width: 599, height: 800 });
    await page.goto('/');

    const gridCount = await page.locator('.cards-grid').count();
    if (gridCount === 0) return;

    const cols = await page.locator('.cards-grid').first().evaluate(el =>
      getComputedStyle(el).gridTemplateColumns
    );
    expect(trackCount(cols)).toBe(1);
  });

  // ── 600–768px: still single column (previously broken zone) ──────────────

  test('700px — header-container stays single column (no overflow zone)', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.goto('/');

    const cols = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.header-container')).gridTemplateColumns
    );
    expect(trackCount(cols)).toBe(1);
  });

  // ── ≥769px: desktop header layout ─────────────────────────────────────────

  test('≥769px — header-container is two-column', async ({ page }) => {
    await page.setViewportSize({ width: 769, height: 800 });
    await page.goto('/');

    const cols = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.header-container')).gridTemplateColumns
    );
    expect(trackCount(cols)).toBe(2);
  });

  test('≥769px — skip-link is visible before any scroll', async ({ page }) => {
    await page.setViewportSize({ width: 769, height: 800 });
    await page.goto('/');

    const visibility = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.skip-link-header')).visibility
    );
    expect(visibility).toBe('visible');
  });

  test('≥769px — hamburger toggle is hidden and nav is always visible', async ({ page }) => {
    await page.setViewportSize({ width: 769, height: 800 });
    await page.goto('/');

    // Toggle must be hidden on desktop
    const toggleDisplay = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.nav-toggle')).display
    );
    expect(toggleDisplay).toBe('none');
    // Nav must be visible (height > 0) without any interaction
    const navHeight = await page.locator('nav').evaluate(el => el.getBoundingClientRect().height);
    expect(navHeight).toBeGreaterThan(0);
  });

  // ── ≤480px: phone-specific layout ─────────────────────────────────────────

  test('≤480px — nav stacks vertically (no horizontal overflow)', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto('/');

    // nav ul usa flex-direction: column — gli elementi si impilano verticalmente
    // senza overflow orizzontale (non serve flex-wrap: wrap in layout a colonna)
    const flexDirection = await page.evaluate(() =>
      getComputedStyle(document.querySelector('nav ul')).flexDirection
    );
    expect(flexDirection).toBe('column');
  });

  // ── ≥768px: multi-column cards ────────────────────────────────────────────

  test('≥768px — cards grid has more than one column', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');

    const gridCount = await page.locator('.cards-grid').count();
    if (gridCount === 0) return;

    const cols = await page.locator('.cards-grid').first().evaluate(el =>
      getComputedStyle(el).gridTemplateColumns
    );
    expect(trackCount(cols)).toBeGreaterThan(1);
  });

  // ── CLS during scroll (Chromium only — layout-shift API) ──────────────────

  test('CLS during scroll is below 0.1', async ({ page, browserName }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    if (browserName !== 'chromium') {
      // layout-shift PerformanceObserver is Chromium-only.
      // Proxy: the sticky header must stay at top=0 before and after scroll.
      const before = await page.locator('header').boundingBox();
      await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'instant' }));
      await page.waitForTimeout(200);
      const after = await page.locator('header').boundingBox();
      expect(before?.y).toBe(0);
      expect(after?.y).toBe(0);
      return;
    }

    const cls = await page.evaluate(() => new Promise(resolve => {
      let total = 0;
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) total += entry.value;
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
      window.scrollBy({ top: 600, behavior: 'smooth' });
      setTimeout(() => window.scrollBy({ top: -600, behavior: 'smooth' }), 400);
      setTimeout(() => {
        observer.disconnect();
        resolve(total);
      }, 1200);
    }));

    expect(cls).toBeLessThan(0.1);
  });
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
