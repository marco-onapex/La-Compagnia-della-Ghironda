# Testing & Verification Guide

Complete testing and verification suite for La Compagnia della Ghironda.

## Overview

This project includes comprehensive testing across multiple dimensions:

- **Unit Tests**: Jest-based tests for JavaScript modules (100% per-file coverage enforced — see `jest.config.cjs`)
- **E2E Tests**: Playwright browser automation for user flows and interactions
- **Accessibility Tests**: axe-core and keyboard navigation verification
- **Performance Audits**: Lighthouse metrics and bundle size tracking

---

## Quick Start

### Run All Tests

```bash
npm run test:all
```

### Run Unit Tests Only

```bash
npm run test:unit          # Run with coverage report
npm run test:unit:watch   # Run in watch mode (auto-rerun on file changes)
```

### Run E2E Tests Only

```bash
npm run test:e2e          # Headless mode (CI/CD compatible)
npm run test:e2e:headed   # Visible browser for debugging
npm run test:e2e:debug    # Interactive debug mode
```

### Run Accessibility Tests

```bash
npm run test:accessibility  # Full a11y suite (axe-core + keyboard navigation, all browsers)
```

### Run Performance Audits

```bash
npm run audit:lighthouse    # Full Lighthouse audit (generates HTML report)
npm run audit:lighthouse -- --json  # JSON output for CI/CD integration
```

---

## Unit Tests (Jest)

### Location

`tests/unit/` - All unit test files

### Test Files (<!-- AUTO:UNIT_SUITE_COUNT -->9<!-- /AUTO --> suites)

Production runtime (Level B JS surface):

- `main.test.js` - Entry-point bootstrap (deferred CSS link injection, ?vitals URL-param activation, link.onload/onerror handlers, SW registration success/failure/absent paths, no graphical mutation, no inline styles/classes/ARIA)
- `logger.test.js` - `devWarn` console wrapper, dev path on jsdom localhost
- `vitals.test.js` - Web Vitals beacon (FCP/LCP/CLS/INP), opt-in via `window.__vitalsEndpoint`, same-origin guard, `PerformanceObserver.supportedEntryTypes` gate
- `sw.test.js` - Service Worker (install/activate/fetch handlers, NetworkFirst HTML, SWR static, content-type policy, AbortSignal.timeout budget). sw.js esporta `setup(self, env)` via dual-mode CJS bootstrap (`module.exports` quando ESM/CJS, invocazione diretta nel worker scope), così i test la `require()` via `jest.isolateModules` e Stryker la mutate dal pipeline transform standard.

Build pipeline + integrity gates:

- `scripts.test.js` - Smoke test su `scripts/cache-bust.js` + `scripts/generate-csp.js` (deploy-critical), eseguiti in working dir temp così non muta i file committati.
- `font-subset-coverage.test.js` - Bidirectional verification che il glyph set richiesto dal DOM ⊆ il subset committato in `fonts/*.woff2` AND viceversa (no over-subsetting).
- `docs-lint.test.js` - 90+ unit tests sul gate `scripts/docs-lint.js` (regex layer + npm-script + asset-reference + CSS url() integrity, pure helpers + I/O wrappers via DI seam).
- `inject-doc-numbers.test.js` - Marker substitution helper (`injectMarkers()`, `MARKER_RE`), pinning idempotenza e gestione di unknown keys.

### Coverage Targets (jest.config.cjs)

```
- Statements: 100% minimum (global + per-file)
- Branches:   100% minimum (global + per-file)
- Functions:  100% minimum (global + per-file)
- Lines:      100% minimum (global + per-file)
```

Current: **100% stmts / 100% lines / 100% funcs / 100% branches**, **100% mutation score** (Stryker).

### Example Test Structure

```javascript
describe('Module Name', () => {
  beforeEach(() => {
    // Setup DOM/mocks
  });

  describe('Specific Functionality', () => {
    test('should + expected behavior', () => {
      // Arrange, Act, Assert
    });
  });
});
```

### What Gets Tested

✅ Module exports and function signatures
✅ Web Vitals (FCP/LCP/CLS/INP) PerformanceObserver wiring + `sendBeacon` opt-in (same-origin enforcement)
✅ Logger dev-warn behaviour
✅ Service Worker: install/activate/fetch handlers, NetworkFirst HTML, SWR static, content-type policy, AbortSignal.timeout budget
✅ Bootstrap module is side-effect-safe: no inline styles, no class toggles, no ARIA writes from JS
✅ Feature detection paths (PerformanceObserver, ServiceWorker)

### What's Excluded from Coverage

- `js/modules/logger.js` carries 3 documented `/* istanbul ignore */` annotations: `window.location` is locked in jsdom (verified that both `Object.defineProperty(window, 'location', ...)` AND `jest.spyOn(window.location, 'hostname', 'get')` are rejected), so the production-host branch and the `127.0.0.1` branch are structurally unreachable from a unit test. Production behaviour is integration-verified on the deployed GH Pages.
- `js/main.js` is fully covered as of the Apr 2026 follow-up. `tests/unit/main.test.js` exercises every branch — readyState=loading vs complete, link.onload/onerror, ?vitals URL-param activation, SW registration success/failure/absent. Stryker mutates main.js with all 30 mutants killed.

---

## E2E Tests (Playwright)

### Location

`tests/e2e/` - Browser automation tests

### Test Files (<!-- AUTO:E2E_SPEC_FILE_COUNT -->8<!-- /AUTO --> specs)

- `main.spec.js` - Core functionality (rendering, navigation, meta tags, performance, ghironda image)
- `mobile.spec.js` - Responsive breakpoints (≤480, ≤599, 900, ≥1024) + mobile devices + CLS during scroll
- `accessibility.spec.js` - WCAG AA compliance via axe-playwright + keyboard navigation
- `visual.spec.js` - Pixel-level regression snapshots across 3 viewport widths (1280, 1024, 375) × 3 browsers; gated by Linux baselines committed via the `update-snapshots` workflow (skipped with prominent job-summary warning when missing — see TROUBLESHOOTING.md)
- `console-clean.spec.js` - Asserts no `console.warn`/`console.error` during page load on any of the 3 browsers
- `font-rendering.spec.js` - Verifies body's computed `font-family` resolves to Cinzel from first paint (catches font-load regressions)
- `keyboard.webkit.spec.js` - Tab-order + focus-indicator regression suite, WebKit-specific (Safari Tab behaviour differs)
- `cls-proxy.spec.js` - CLS measurement via PerformanceObserver, captures actual layout-shift events during scroll

### Browsers Tested

✅ Chromium (Chrome, Edge)
✅ Firefox
✅ WebKit (Safari)

### Test Categories

#### Page Loading & Rendering

- Page loads without console errors
- DOM structure is valid (header, main, footer present)
- CSS variables are applied
- SVG topography renders

#### Navigation & Scrolling

- Nav links function correctly
- Scroll-to-section works
- Active-section nav highlight via CSS view-timeline (chromium-only assertion; firefox/webkit fall through to the visual baseline since Playwright's bundled builds don't enable scroll-driven view-timeline)

#### Keyboard Navigation

- Tab order is logical
- Focus indicator visible
- All interactive elements accessible
- No focus traps

#### Responsive Design

- Mobile (375x667), Tablet (768x1024), Desktop (1920x1080)
- Layout adapts without horizontal scroll
- Touch targets adequate

#### Accessibility

- Proper heading hierarchy (H1, H2, etc.)
- Images have alt text
- Semantic HTML (header, nav, main, section, footer)
- WCAG AA color contrast
- Links and buttons accessible

#### Performance

- Page loads < 5 seconds
- No layout shift issues
- Images have width/height attributes
- Bundle sizes within limits

#### Meta Information

- Viewport meta tag present
- Meta description configured
- og:\* tags for social sharing
- Canonical tag for SEO

---

## Accessibility Testing

### Manual Checks

```bash
# Start local server on port 8000
npx http-server . -p 8000 &

# Run axe accessibility scan (full Playwright suite — Chromium, Firefox, WebKit)
npm run test:accessibility
```

### Automated a11y Tests

- Heading hierarchy validation
- Color contrast ratio checking
- Link text descriptiveness
- Form label associations
- ARIA attribute usage
- Landmark detection

### Keyboard Navigation Test

- Tab through all focusable elements
- Verify focus indicators visible (2px gold outline)
- Escape key handling
- No keyboard traps
- Logical tab order

### Known Issues

- Library `axe-playwright` requires manual setup - configure as needed
- Screen reader testing (NVDA, JAWS, VoiceOver) requires manual verification
- Mobile a11y (touch events, mobile screen readers) requires device testing

---

## Running Tests in CI/CD

### GitHub Actions Configuration

```yaml
- name: Run Unit Tests
  run: npm run test:unit

- name: Run Linting
  run: npm run test:lint

- name: Run E2E Tests
  run: npm run test:e2e

- name: Generate Coverage Report
  run: npm run test:unit -- --coverage
```

### Pre-Commit Hook

```bash
# Prevents commits if tests fail
npm test || exit 1
```

---

## Test Results

### Output Locations

**Unit Tests**

- Console output: Coverage summary
- HTML reports: `coverage/lcov-report/index.html`
- JSON reports: `coverage/coverage-final.json`

**E2E Tests**

- HTML report: `test-results/playwright/index.html`
- JSON report: `test-results/playwright.json`
- Screenshots: `test-results/` (on failures)
- Videos: `test-results/` (configurable)

**Lighthouse**

- HTML report: `test-results/lighthouse.html`
- JSON report: `test-results/lighthouse.json`

### Interpreting Results

#### Jest Coverage

- Green (✓): Above threshold
- Red (✗): Below threshold - needs more tests
- Threshold is 100% per-file (statements, branches, functions, lines) — see `jest.config.cjs`. Untestable defensive branches use `/* istanbul ignore next */` with a justification comment.

#### Playwright Report

- Green checkmark: All tests passed
- Red X: Test failed - check screenshots/videos
- Slower tests indicate performance issues

#### Lighthouse Scores

- Green (90-100): Excellent
- Yellow (50-89): Needs improvement
- Red (0-49): Critical fixes needed

---

## Debugging Tests

### Debug Mode (Interactive)

```bash
npm run test:e2e:debug
# Press 'k' for keyboard shortcuts
# Step through tests interactively
```

### Headed Mode (See Browser)

```bash
npm run test:e2e:headed
# Browser window visible during test execution
```

### Verbose Jest Output

```bash
DEBUG_TEST=1 npm run test:unit
# Shows console logs/errors during test execution
```

### Playwright Inspector

```bash
PWDEBUG=1 npm run test:e2e
# Opens Playwright Inspector UI
```

### Check Specific Test

```bash
npm run test:e2e -- --grep "should show focus indicator"
# Runs only tests matching regex pattern
```

---

## Performance Baselines

### Bundle Sizes (auto-injected via `scripts/inject-doc-numbers.js` — see Round 9 of the Apr 2026 follow-up)

- CSS critical (inlined in HTML): ~<!-- AUTO:CSS_INLINE_RAW -->13.2<!-- /AUTO --> KB raw / ~<!-- AUTO:CSS_INLINE_GZIP -->3.5<!-- /AUTO --> KB gzip
- CSS deferred (`dist/style-deferred.min.css`): ~<!-- AUTO:CSS_DEFERRED_RAW -->8.8<!-- /AUTO --> KB raw / ~<!-- AUTO:CSS_DEFERRED_GZIP -->2.5<!-- /AUTO --> KB gzip
- JavaScript (`dist/main.min.js`): ~<!-- AUTO:JS_RAW -->2.7<!-- /AUTO --> KB raw / ~<!-- AUTO:JS_GZIP -->1.2<!-- /AUTO --> KB gzip
- **Total raw: ~<!-- AUTO:TOTAL_RAW -->24.6<!-- /AUTO --> KB; gzip: ~<!-- AUTO:TOTAL_GZIP -->7.1<!-- /AUTO --> KB** (sotto budget <!-- AUTO:BUDGET_TOTAL_MAX -->10<!-- /AUTO --> KB gzip)

Budget enforced automaticamente da `scripts/performance-budget.js` (post-build).

### Load Time Targets

- First Contentful Paint (FCP): < 2s
- Largest Contentful Paint (LCP): < 3s
- Cumulative Layout Shift (CLS): < 0.1 (attualmente 0.000 — `--header-h: 77px` è dichiarato statico in `css/4-header.css :root`, no inline script needed dopo il Level-B refactor)
- Total Blocking Time (TBT): < 200ms

### Lighthouse Targets (CI-enforced su PR)

- Performance: 100
- Accessibility: 100
- Best Practices: 100
- SEO: 100

I threshold sono enforced da `scripts/enforce-lighthouse.js` e bloccano la PR; sui push diretti sono monitoring (non bloccano).

---

## Continuous Improvement

### Coverage Goals

- Current: **100% stmts / 100% lines / 100% funcs / 100% branches** (jest soglia: 100%, mutation score: 100%)
- Target: mantenere 100% per ogni modifica
- Track changes via Codecov upload in CI

### Performance Monitoring

- Run `audit:lighthouse` monthly
- Compare against baselines
- Investigate >10% regressions

### Accessibility Audits

- Run manual a11y audit quarterly
- Test on real devices (iOS, Android)
- Test with real screen readers

---

## Troubleshooting

### "Port 8000 in use"

```bash
# Kill process using port 8000
npx kill-port 8000
npm run test:e2e
```

### "Failed to launch browser"

```bash
# Reinstall Playwright browsers
npx playwright install
npm run test:e2e
```

### "Tests timing out"

Jest defaults to 5s timeout. Increase for slower machines:

```bash
npm run test:unit -- --testTimeout=10000
```

### "Module not found" errors

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
npm run test:unit
```

### Coverage below threshold

```bash
# Check uncovered lines
npm run test:unit -- --coverage --collectCoverageFrom="js/**/*.js"
# Add tests for uncovered code paths
```

---

## Best Practices

✅ **Do:**

- Write tests for error cases and edge conditions
- Run tests before committing code
- Keep tests focused on single responsibility
- Use descriptive test names
- Mock external dependencies (APIs, timers)

❌ **Don't:**

- Test implementation details (test behavior instead)
- Create tests that depend on other tests
- Use hardcoded delays (use waitForSelector instead)
- Skip or disable tests permanently
- Test unrelated modules in single test

---

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Playwright Documentation](https://playwright.dev/)
- [axe Testing Documentation](https://github.com/dequelabs/axe-core)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Lighthouse Documentation](https://developers.google.com/web/tools/lighthouse)
