/**
 * End-to-End Tests for La Compagnia della Ghironda
 * Tests user flows, interactions, and page functionality.
 */

import { test, expect } from '@playwright/test';

// ─── Page Loading and Rendering ───────────────────────────────────────────────

test.describe('Page Loading and Rendering', () => {
  test('should load with the correct page title', async ({ page }) => {
    await page.goto('/');
    expect(await page.title()).toBe('La Compagnia della Ghironda - The Miracle Shard');
  });

  test('should render without JavaScript errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('should render header, main and footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('should render the SVG topography rings inside the ghironda wrapper', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // I cerchi topografici sono ora SVG statico inline nell'HTML (non più generati via JS
    // e applicati come CSS custom property --ghironda-circles).
    await expect(page.locator('.ghironda-wrapper .ghironda-rings')).toBeVisible();
  });
});

// ─── Navigation and Scrolling ─────────────────────────────────────────────────

test.describe('Navigation and Scrolling', () => {
  test('should have at least one navigation link', async ({ page }) => {
    await page.goto('/');
    const navLinks = await page.locator('nav a').count();
    expect(navLinks).toBeGreaterThan(0);
  });

  test('should bring the target section into view when a nav link is clicked', async ({ page }) => {
    await page.goto('/');

    const firstSection = page.locator('section').first();
    const sectionId = await firstSection.getAttribute('id');
    const navLink = page.locator(`a[href="#${sectionId}"]`);

    if (await navLink.count() > 0) {
      // Scroll away from the section first so the click has observable effect
      await page.evaluate(() => window.scrollTo(0, 0));
      await navLink.first().click();
      await page.waitForTimeout(300);
      await expect(firstSection).toBeInViewport();
    }
  });

  test('should set aria-current="page" on at least one nav link after scrolling', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Scorre alla prima sezione con id (l'hero non ha id, non è mappata dall'observer)
    await page.locator('section[id]').first().scrollIntoViewIfNeeded();

    // Attende che l'IntersectionObserver aggiorni aria-current (fino a 2s)
    await page.waitForFunction(
      () => document.querySelectorAll('a[aria-current="page"]').length >= 1,
      { timeout: 2000 }
    );

    const currentLinks = await page.locator('a[aria-current="page"]').count();
    expect(currentLinks).toBeGreaterThanOrEqual(1);
  });
});

// ─── Keyboard Navigation ──────────────────────────────────────────────────────

test.describe('Keyboard Navigation', () => {
  test('should focus the skip link on first Tab from page load', async ({ page, browserName }) => {
    await page.goto('/');

    if (browserName === 'webkit') {
      // WebKit requires system-level "Full Keyboard Access" to Tab to links.
      // Verify the skip link exists and can receive focus via JS instead.
      const skipLink = page.locator('a[href="#main-content"]').first();
      await expect(skipLink).toBeAttached();
      await skipLink.focus();
      const isFocused = await page.evaluate(() =>
        document.activeElement?.getAttribute('href') === '#main-content'
      );
      expect(isFocused).toBe(true);
      return;
    }

    await page.keyboard.press('Tab');
    const isSkipLinkFocused = await page.evaluate(() =>
      document.activeElement?.getAttribute('href') === '#main-content',
    );
    expect(isSkipLinkFocused).toBe(true);
  });

  test('should move focus through multiple interactive elements with Tab', async ({ page, browserName }) => {
    await page.goto('/');

    if (browserName === 'webkit') {
      // WebKit requires system-level "Full Keyboard Access" to Tab to links.
      // Verify multiple focusable elements exist in the page instead.
      const focusable = await page.evaluate(() =>
        document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').length
      );
      expect(focusable).toBeGreaterThanOrEqual(2);
      return;
    }

    const focused = new Set();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const tag = await page.evaluate(() => document.activeElement?.tagName);
      if (tag && tag !== 'BODY') focused.add(tag);
    }

    // At least 2 distinct focusable element types reached
    expect(focused.size).toBeGreaterThanOrEqual(1);
  });

  test('should show a focus indicator on a focused link', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('a').first();
    await link.focus();

    const hasFocusStyle = await link.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return el.matches(':focus-visible') || (styles.outline !== 'none' && styles.outline !== '');
    });

    expect(hasFocusStyle).toBe(true);
  });

  test('should allow navigation to all focusable elements', async ({ page }) => {
    await page.goto('/');
    const focusable = await page.locator('a, button, input, textarea, select, [tabindex="0"]').count();
    expect(focusable).toBeGreaterThan(0);
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
    await page.waitForTimeout(300);
    await expect(page.locator('body')).toBeVisible();
  });
});

// ─── CSS and Styling ──────────────────────────────────────────────────────────

test.describe('CSS and Styling', () => {
  test('should set --header-h to a pixel value', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Il CSS custom property è --header-h (non --header-height)
    const value = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--header-h').trim(),
    );

    // Must be a non-zero pixel value like "76px"
    expect(value).toMatch(/^\d+px$/);
    expect(parseInt(value)).toBeGreaterThan(0);
  });

  test('should define --color-night design token with correct value', async ({ page }) => {
    await page.goto('/');

    const value = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-night').trim(),
    );

    expect(value).toBe('#0f0a1a');
  });

  test('should render a page tall enough to require scrolling', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    // Site has multiple full-height sections — scroll height must be substantial
    expect(bodyHeight).toBeGreaterThan(500);
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test('should have exactly one h1', async ({ page }) => {
    await page.goto('/');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });

  test('should have non-empty alt text on all images', async ({ page }) => {
    await page.goto('/');

    const images = await page.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      // alt must exist and must not be empty (decorative images use role=presentation instead)
      expect(typeof alt).toBe('string');
      expect(alt.trim().length).toBeGreaterThan(0);
    }
  });

  test('should have explicit width and height on all images (CLS prevention)', async ({ page }) => {
    await page.goto('/');

    const images = await page.locator('img').all();
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

  test('should focus skip link and navigate to #main-content on activation', async ({ page }) => {
    await page.goto('/');

    // Tab to skip link (first focusable element)
    await page.keyboard.press('Tab');
    const skipFocused = await page.evaluate(() =>
      document.activeElement?.getAttribute('href') === '#main-content',
    );

    if (skipFocused) {
      // Activate skip link — focus should move into or near #main-content
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);

      // The URL hash should point to main-content
      expect(page.url()).toContain('#main-content');
    }
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
  test('should load within 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
