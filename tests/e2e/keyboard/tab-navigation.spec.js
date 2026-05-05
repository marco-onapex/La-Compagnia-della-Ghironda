/**
 * Real keyboard navigation tests — chromium + firefox only.
 *
 * Excluded from the webkit project (see playwright.config.cjs:testIgnore)
 * because WebKit on Linux CI lacks system-wide "Full Keyboard Access", so
 * Tab key cannot move focus between <a> elements. The webkit-only fallback
 * lives in `tests/e2e/keyboard.webkit.spec.js` and asserts the same DOM
 * contract via `.focus()`.
 *
 * Together the two files give every browser the strongest assertion that
 * its environment supports — without any `test.skip()` in source.
 */

import { test, expect } from '../fixtures.js';

test.describe('Keyboard navigation (real Tab key — chromium/firefox)', () => {
  test('first Tab from page load focuses the skip link', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    const focusedHref = await page.evaluate(() => document.activeElement?.getAttribute('href'));
    expect(focusedHref).toBe('#main-content');
  });

  test('Tab traverses through multiple distinct focusable elements', async ({ page }) => {
    await page.goto('/');

    const reachedKeys = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      reachedKeys.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          return el?.tagName === 'BODY' ? null : el?.id || el?.getAttribute('href') || el?.tagName;
        }),
      );
    }
    const distinct = new Set(reachedKeys.filter(Boolean));
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });

  test('skip link activated by Enter navigates to #main-content', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab'); // focus skip-link
    await page.keyboard.press('Enter'); // activate
    await page.waitForURL('**/#main-content', { timeout: 2000 });
    expect(page.url()).toContain('#main-content');
  });

  test('Tab cycles through focusables without trapping anywhere', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.activeElement?.blur?.();
    });

    // Tab 30 times collecting the activeElement identifier each step.
    const seen = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      seen.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          return el ? el.id || el.className || el.tagName : 'BODY';
        }),
      );
    }
    // Distinct elements seen ≥ 1 (focus moved). If it had been trapped on a
    // single element, distinct would equal 1 with the same key 30 times in
    // a row — flag that explicitly.
    const distinct = new Set(seen);
    expect(distinct.size).toBeGreaterThan(1);
  });
});
