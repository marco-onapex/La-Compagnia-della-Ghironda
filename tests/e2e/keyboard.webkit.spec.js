/**
 * WebKit-only keyboard navigation fallback — runs ONLY in the webkit project
 * (see playwright.config.cjs:testIgnore).
 *
 * WebKit on Linux CI cannot move focus to <a> elements via Tab key without
 * system-level "Full Keyboard Access". The chromium/firefox projects exercise
 * the real Tab key in `tests/e2e/keyboard/tab-navigation.spec.js`; this file
 * verifies the same DOM contract via programmatic `.focus()`, which is fully
 * supported on every platform. No `test.skip()` — project-level filtering
 * routes only the webkit project here.
 */

import { test, expect } from './fixtures.js';

test.describe('Keyboard navigation (focus-based — webkit fallback)', () => {
  test('skip link is the first keyboard-focusable anchor and accepts focus', async ({ page }) => {
    await page.goto('/');

    const skipLink = page.locator('a[href="#main-content"]').first();
    await expect(skipLink).toBeAttached();

    // Verify it is the FIRST tab-reachable anchor in DOM order. The
    // header-title-link comes earlier but has tabindex="-1" until scrolled.
    const isFirstFocusable = await page.evaluate(() => {
      const anchors = [...document.querySelectorAll('a[href]')];
      const firstFocusable = anchors.find((a) => a.getAttribute('tabindex') !== '-1');
      return firstFocusable?.getAttribute('href') === '#main-content';
    });
    expect(isFirstFocusable).toBe(true);

    await skipLink.focus();
    const focusedHref = await page.evaluate(() => document.activeElement?.getAttribute('href'));
    expect(focusedHref).toBe('#main-content');
  });

  test('multiple distinct focusable elements accept programmatic focus', async ({ page }) => {
    await page.goto('/');

    /* The selector `[tabindex]:not([tabindex="-1"])` filters out elements
       authored with `tabindex="-1"` (e.g. the title-link until scrolled),
       AND `:visible` filters out elements that are `display:none` or
       `visibility:hidden` so we don't try to focus a hidden control —
       webkit silently rejects the focus call on hidden anchors and the
       resulting `document.activeElement` is `<body>`, not the element
       we tried to focus. */
    const handles = await page
      .locator(
        'a[href]:visible, button:visible, input:visible, select:visible, textarea:visible, [tabindex]:not([tabindex="-1"]):visible',
      )
      .all();
    /* skip-link + 3 nav anchors + 1 footer link = 5 keyboard-reachable
       elements on the desktop layout (the hamburger button is
       display:none ≥ 1024 px, so we don't count it). A mutant that drops
       one to 4 still passes the old `>= 2` threshold. */
    expect(handles.length).toBeGreaterThanOrEqual(5);

    const results = [];
    for (const handle of handles.slice(0, 5)) {
      await handle.focus();
      results.push(await handle.evaluate((el) => document.activeElement === el));
    }
    /* Every visible focusable element MUST accept programmatic focus.
       The failure mode this test guards against is a CSS
       `pointer-events: none` or `aria-hidden + tabindex=-1` regression
       that silently strips focus from a control that LOOKS reachable. */
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  test('skip link activation navigates to #main-content', async ({ page }) => {
    await page.goto('/');

    const skipLink = page.locator('a[href="#main-content"]').first();
    await skipLink.focus();
    await skipLink.click();
    await page.waitForURL('**/#main-content', { timeout: 2000 });
    expect(page.url()).toContain('#main-content');
  });

  test('focusing each focusable element does not trap focus on any one', async ({ page }) => {
    await page.goto('/');

    const handles = await page
      .locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
      .all();
    expect(handles.length).toBeGreaterThan(0);

    const results = [];
    for (const handle of handles) {
      await handle.focus();
      results.push(await handle.evaluate((el) => document.activeElement === el));
    }
    expect(results.filter(Boolean).length).toBeGreaterThan(handles.length / 2);
  });
});
