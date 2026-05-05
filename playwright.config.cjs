/**
 * Playwright Config — e2e + accessibility + visual regression.
 */

module.exports = {
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,

  /* Retry strategy.
     - CI: 2 retries to absorb transient network/timing flake on shared runners.
     - Local: 0 retries (fail-fast — surfaces real bugs immediately).
     Combined with `trace: 'retain-on-failure'`, every CI failure has a
     trace artifact even when the first retry succeeds. */
  retries: process.env.CI ? 2 : 0,

  /* Snapshot policy.
     'none' EVERYWHERE: a missing baseline fails the test instead of
     silently auto-generating it (which would let CI run without ever
     comparing a real baseline — the very bug this project tripped on).
     Baselines are created exclusively via the `update-snapshots` workflow
     or `npm run test:visual:update` locally. */
  updateSnapshots: 'none',

  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/playwright.json' }],
    ['list'],
  ],

  expect: {
    timeout: 10000,
    /* Visual-regression noise floor: 3% pixel-diff ratio.
       Empirical observation (Apr 2026): chromium's mobile emulation
       produces ~3% subpixel-AA jitter on the hero text between
       successive runs *with identical baselines* — i.e. the noise
       floor is genuinely ~3%, not a regression. 1% would be ideal
       but produces single-run flakes; 5% would mask real changes
       (an entire header region can fit in 5%). 3% is the empirical
       lower bound that still flags layout / styling regressions
       (which diff at ≥10%). Firefox + WebKit settle at ~1% with
       this same setup. */
    toHaveScreenshot: { maxDiffPixelRatio: 0.03 },
  },

  use: {
    baseURL: 'http://localhost:8000',

    /* `retain-on-failure` produces a trace for every failure, including
       on the first attempt. `on-first-retry` would skip the trace when
       the first retry succeeds — losing diagnostic data for transient
       bugs that look intermittent at first but compound over time. */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    actionTimeout: 5000,
    navigationTimeout: 15000,
    ignoreHTTPSErrors: false,
  },

  webServer: {
    command: 'node scripts/dev-server.js',
    url: 'http://localhost:8000',
    reuseExistingServer: false,
    timeout: 30000,
    env: { TEST_MODE: '1' },
  },

  /* Project filtering rationale (no test.skip needed in source):
     - Chromium / Firefox / WebKit run all SHARED tests (no testIgnore).
     - Files under `tests/e2e/keyboard/` use real `keyboard.press('Tab')`
       which is unrunnable on WebKit/Linux CI (Full Keyboard Access
       required). The webkit project ignores them via testIgnore; the
       webkit-only fallback lives in `tests/e2e/keyboard.webkit.spec.js`
       and asserts the same DOM contract via `.focus()`.
     - Files under `tests/e2e/cls-direct/` use the chromium-only
       PerformanceObserver layout-shift API; firefox+webkit ignore them
       and run a sticky-header proxy in `tests/e2e/cls-proxy.spec.js`. */
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      testIgnore: ['**/keyboard.webkit.spec.js', '**/cls-proxy.spec.js'],
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
      testIgnore: ['**/keyboard.webkit.spec.js', '**/cls-direct/**'],
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
      testIgnore: ['**/keyboard/**', '**/cls-direct/**'],
    },
  ],
};
