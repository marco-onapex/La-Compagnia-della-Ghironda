import { test, expect } from './fixtures.js';

/**
 * Console-clean smoke test — fails on ANY console.warn / console.error
 * during a full page load + idle settle.
 *
 * Why this exists: in Apr 2026 a regression slipped through every
 * existing test layer (jest, e2e, visual, Lighthouse) — Chromium
 * logged "Ignored unsupported entryTypes: layout-shift" from
 * `js/modules/vitals.js` because the module called
 * `PerformanceObserver.observe({ type: 'layout-shift' })` without
 * gating on `PerformanceObserver.supportedEntryTypes`. Coverage was
 * 100% (the offending line was executed), mutation score was 100%,
 * but no test inspected the browser console — the warning was only
 * caught when a user reported it.
 *
 * Scope: this spec asserts that a normal page load produces ZERO
 * `warning` and ZERO `error` log entries from page code. Allowed
 * exceptions:
 *   - Service Worker registration messages (browser-emitted, not
 *     under our control on first install)
 *   - Resource-load failures from Playwright's image-handling for
 *     intentionally-missing assets (none currently)
 *
 * Runs on every browser project (chromium / firefox / webkit) since
 * each engine has its own console-warning policy and the entryTypes
 * regression manifested differently across them.
 */

const ALLOWED_PATTERNS = [
  /* Round-21 hardening: the previous catch-all
     `/service worker registration/i` masked BOTH the benign
     "registration: success" message AND any "registration: failed"
     warning emitted by the browser when SW registration breaks.
     Tighten to allow only the success/installed/registered side
     so a real SW failure surfaces as a console-clean violation. */
  /service worker registration:?\s*(success|installed|registered)/i,
  /* Playwright's bundled Firefox emits a benign cookie-partitioning
     warning unrelated to page code. The rest of "Cookie ... is
     partitioned by ..." messages — including the actual failure
     mode where a third-party cookie is BLOCKED — would still be
     useful, but our site has no third-party cookies, so the entire
     message family is benign here. */
  /partitioned cookie/i,
];

function isAllowed(text) {
  return ALLOWED_PATTERNS.some((re) => re.test(text));
}

test.describe('Console-clean smoke test', () => {
  test('no console.warn / console.error on full page load', async ({ page, home }) => {
    const noisy = [];
    page.on('console', (msg) => {
      const type = msg.type();
      if (type !== 'warning' && type !== 'error') {
        return;
      }
      const text = msg.text();
      if (isAllowed(text)) {
        return;
      }
      noisy.push({
        type,
        text,
        /* `location()` returns `{url, lineNumber, columnNumber}` —
           helpful to localise the offending line in the bundled JS. */
        location: msg.location(),
      });
    });

    /* Also catch uncaught exceptions and unhandled rejections. */
    page.on('pageerror', (err) => {
      noisy.push({ type: 'pageerror', text: err.message, location: { stack: err.stack } });
    });

    await home.open();
    await page.waitForLoadState('load');
    /* Give the deferred-CSS loader, font fetches, vitals observers,
       and SW registration a chance to settle. Two rAF cycles flush
       layout/paint without a fixed-duration sleep. */
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.evaluate(() => document.fonts.ready);
    /* Trigger a synthetic interaction so any INP-related observer
       activity surfaces (and any console noise from it would surface
       too). Click an inert area that doesn't navigate. */
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );

    expect(
      noisy,
      `Console must be clean on a full page-load + interaction settle. Found ${noisy.length} noisy entries:\n` +
        noisy
          .map(
            (n) =>
              `  [${n.type}] ${n.text}` +
              (n.location?.url
                ? `\n    at ${n.location.url}:${n.location.lineNumber}:${n.location.columnNumber}`
                : ''),
          )
          .join('\n'),
    ).toEqual([]);
  });
});
