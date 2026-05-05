/**
 * CLS proxy assertion — firefox + webkit only.
 *
 * Excluded from the chromium project (see playwright.config.cjs:testIgnore)
 * because chromium runs the direct PerformanceObserver layout-shift
 * measurement in `tests/e2e/cls-direct/cls-measurement.spec.js`. Here we
 * verify a precise proxy: the sticky header stays glued to top=0 across
 * a 600px programmatic scroll, which would be impossible with any
 * layout-shifting content above or around it.
 */

import { test, expect } from './fixtures.js';

test('sticky header stays at top=0 across scroll (proxy for CLS=0)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.waitForLoadState('load');

  const before = await page.locator('header').boundingBox();
  await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'instant' }));
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const after = await page.locator('header').boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(before.y).toBe(0);
  expect(after.y).toBe(0);
});
