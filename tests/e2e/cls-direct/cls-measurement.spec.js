/**
 * Direct Cumulative Layout Shift measurement — chromium-only.
 *
 * Excluded from firefox + webkit projects (see playwright.config.cjs:
 * testIgnore) because the layout-shift PerformanceObserver entry type is
 * Chromium-specific (Web Vitals proposal not yet shipped in Gecko/WebKit
 * as of 2026). Firefox + WebKit assert the same invariant via the
 * sticky-header proxy in `tests/e2e/cls-proxy.spec.js`.
 */

import { test, expect } from '../fixtures.js';

test('CLS during scroll is below 0.1 (chromium PerformanceObserver direct)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.waitForLoadState('load');

  const cls = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let total = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              total += entry.value;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        window.scrollBy({ top: 600, behavior: 'smooth' });
        setTimeout(() => window.scrollBy({ top: -600, behavior: 'smooth' }), 400);
        setTimeout(() => {
          observer.disconnect();
          resolve(total);
        }, 1200);
      }),
  );

  /* The site targets CLS = 0 (font-display:optional, sticky header, no
     deferred layout-shifting images). 0.1 is the CWV "needs improvement"
     boundary — too lax for a site that aims for Lighthouse 100/100. A
     0.05 ceiling would still let through 5× the deserved budget; we
     enforce 0.01 (≈ 1 px shift on a 100×100 element) to flag any real
     regression early. */
  expect(cls).toBeLessThan(0.01);
});
