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

import { test, expect, devices } from '@playwright/test';

const MOBILE_DEVICES = {
  'iPhone SE': devices['iPhone SE'],  // ~375px
  'Pixel 5':   devices['Pixel 5'],    // ~393px
  'iPad Pro':  devices['iPad Pro'],   // ~1024px
};

// Count resolved grid column tracks from a computed gridTemplateColumns string.
// Computed values are always space-separated px lengths, e.g. "200px 400px".
function trackCount(gridTemplateColumns) {
  return gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
}

// ─── 1. Device-based tests ────────────────────────────────────────────────────

test.describe('Mobile Responsiveness', () => {
  for (const [deviceName, device] of Object.entries(MOBILE_DEVICES)) {
    test.describe(deviceName, () => {
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
        const navLinks = page.locator('nav a');
        const count = await navLinks.count();
        for (let i = 0; i < count; i++) {
          const box = await navLinks.nth(i).boundingBox();
          expect(box).not.toBeNull();
          if (box) {
            expect(box.height).toBeGreaterThanOrEqual(44);
            expect(box.width).toBeGreaterThanOrEqual(44);
          }
        }
      });

      test('anchor navigation scrolls to target section', async ({ page }) => {
        await page.goto('/');
        await page.locator('a[href="#origine-identita"]').click();
        await page.waitForURL('**/#origine-identita');
        await expect(page.locator('#origine-identita')).toBeVisible();
      });

      test('images load with natural dimensions', async ({ page }) => {
        await page.goto('/');
        const images = page.locator('img');
        const count = await images.count();
        for (let i = 0; i < count; i++) {
          const complete      = await images.nth(i).evaluate(el => el.complete);
          const hasNatural    = await images.nth(i).evaluate(el => el.naturalHeight > 0);
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
});

// ─── 2. CSS Breakpoint Assertions ─────────────────────────────────────────────

test.describe('CSS Breakpoint Assertions', () => {

  // ── ≤599px: mobile header layout ──────────────────────────────────────────

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

  test('≤599px — skip-link is hidden, title-link is always visible', async ({ page }) => {
    await page.setViewportSize({ width: 599, height: 800 });
    await page.goto('/');

    const skipVisibility  = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.skip-link-header')).visibility
    );
    const titleVisibility = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.header-title-link')).visibility
    );
    const titleOpacity    = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.header-title-link')).opacity)
    );

    expect(skipVisibility).toBe('hidden');
    expect(titleVisibility).toBe('visible');
    expect(titleOpacity).toBeGreaterThan(0);
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

  // ── ≤480px: phone-specific layout ─────────────────────────────────────────

  test('≤480px — nav wraps instead of overflowing', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto('/');

    const flexWrap = await page.evaluate(() =>
      getComputedStyle(document.querySelector('nav ul')).flexWrap
    );
    expect(flexWrap).toBe('wrap');
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
    test.skip(browserName !== 'chromium', 'layout-shift PerformanceObserver is Chromium-only');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

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
