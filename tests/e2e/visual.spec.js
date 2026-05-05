/**
 * Visual Regression Tests — La Compagnia della Ghironda
 *
 * Captures pixel-level screenshots of key layouts and UI states.
 * On first run, Playwright generates baseline snapshots in
 * tests/e2e/visual.spec.js-snapshots/. Subsequent runs compare against
 * those baselines (maxDiffPixelRatio set in playwright.config.cjs).
 *
 * To regenerate baselines after intentional design changes:
 *   npx playwright test tests/e2e/visual.spec.js --update-snapshots
 */

import { test, expect } from './fixtures.js';

test.describe('Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Force font-display:block in all CSS/HTML so every font is downloaded before
    // first paint, making layout height deterministic across browsers and runs.
    // Production uses font-display:optional (CLS=0); tests need block.
    // The deferred CSS (style-deferred.min.css) declares Cinzel with optional —
    // without this intercept Firefox renders at fallback metrics, making the first
    // section ~415px shorter than the baseline captured with Cinzel loaded.
    const patchFontDisplay = async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replaceAll(
        'font-display:optional',
        'font-display:block',
      );
      await route.fulfill({ response, body });
    };
    await page.route('http://localhost:8000/', patchFontDisplay);
    await page.route('**/dist/style-deferred.min.css**', patchFontDisplay);
    // Disable lazy section rendering: content-visibility:auto can leave Firefox
    // measuring .section at its 650px intrinsic placeholder under parallel load.
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = '.section { content-visibility: visible !important; }';
      document.head.appendChild(style);
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForLoadState('load');
    /* Wait for the deferred stylesheet to land — visual tests must
       capture the FINAL rendered state, not the LCP-window transient.
       Without this wait, screenshots can race the deferred CSS load
       and capture a half-decorated page (hero gradients + ring SVG
       + decorative pseudo-elements live in 9-decorations.css which
       is in the deferred bundle as of Apr 2026). */
    await page.waitForFunction(() => window.__deferredCssLoaded === true);
    await page.evaluate(() => document.fonts.ready);
  });

  // ─── Desktop layouts ────────────────────────────────────────────────────────

  test('desktop hero (1280×720)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page).toHaveScreenshot('desktop-hero.png', { animations: 'disabled' });
  });

  // 1024px is the desktop breakpoint floor — content fits with tight margins.
  // Captures the layout at the fragile narrow-desktop zone where small copy
  // changes (longer brand title, extra nav item) would push content past the
  // viewport. Pairs with the wider 1280 baseline above.
  test('desktop narrow header (1024×768)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('header')).toHaveScreenshot('header-1024.png', {
      animations: 'disabled',
    });
  });

  test('desktop header scrolled state (1280×720)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => window.scrollTo(0, 600));
    /* No .scrolled-class wait — the cross-fade is now driven by a CSS
       scroll-driven animation (4-header.css) without any JS class
       toggle. The single observable signal is the .header-title-link
       opacity reaching ~1 once the h1 has fully exited the viewport. */
    await page.waitForFunction(() => {
      const link = document.querySelector('.header-title-link');
      return link ? Number.parseFloat(getComputedStyle(link).opacity) > 0.95 : false;
    });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(page.locator('header')).toHaveScreenshot('header-scrolled.png', {
      animations: 'disabled',
    });
  });

  test('desktop first content section (1280×800)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const section = page.locator('section[id]').first();
    await section.waitFor({ state: 'visible' });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(section).toHaveScreenshot('section-desktop.png', { animations: 'disabled' });
  });

  // ─── Mobile layouts ─────────────────────────────────────────────────────────

  test('mobile hero (375×667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page).toHaveScreenshot('mobile-hero.png', { animations: 'disabled' });
  });

  test('mobile hamburger nav expanded (375×667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    // The hamburger is a <label> wrapping a visually-hidden checkbox
    // <input type="checkbox" class="nav-toggle-input">. CSS reads
    // state via :has(.nav-toggle-input:checked). Toggling .checked +
    // dispatching change is equivalent to a user click on the label,
    // synchronous from the page perspective.
    await page.evaluate(() => {
      const cb = document.querySelector('.nav-toggle-input');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('.nav-toggle-input')?.checked === true);
    // Wait for the 0.3s max-height animation; reducedMotion is set in
    // beforeEach so transitions are effectively instantaneous here, but a
    // double rAF guarantees the layout has settled.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    // Capture only the header — avoids hero background rendering variability
    await expect(page.locator('header')).toHaveScreenshot('mobile-nav-open.png', {
      animations: 'disabled',
    });
  });

  test('mobile first content section (375×667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const section = page.locator('section[id]').first();
    await section.waitFor({ state: 'visible' });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(section).toHaveScreenshot('section-mobile.png', { animations: 'disabled' });
  });

  // ─── Footer ─────────────────────────────────────────────────────────────────

  test('footer desktop (1280×720)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    // Scroll the footer to the top of the viewport, then capture the page
    // with a fixed-height clip (180 px). Two reasons combined:
    //   (a) using `page.toHaveScreenshot` with a fixed `clip` rect locks the
    //       output dimensions even if the footer's own bounding-box height
    //       drifts ±1 px run-to-run (font-load timing on font-display:block
    //       can produce sub-pixel rounding differences on Chromium);
    //   (b) scrollIntoView({ block: 'start' }) reliably lands footer.top at
    //       y=0 in the viewport, so clip { x: 0, y: 0, … } captures it.
    // Earlier we tried a footer locator screenshot — it eliminated scroll
    // drift but reintroduced the height-mismatch flake. The clip approach
    // covers both.
    await page
      .locator('footer')
      .evaluate((el) => el.scrollIntoView({ behavior: 'instant', block: 'start' }));
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(page).toHaveScreenshot('footer-desktop.png', {
      animations: 'disabled',
      clip: { x: 0, y: 0, width: 1280, height: 180 },
    });
  });
});
