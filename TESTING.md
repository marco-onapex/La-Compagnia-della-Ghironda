# Testing & Verification Guide

Complete testing and verification suite for La Compagnia della Ghironda.

## Overview

This project includes comprehensive testing across multiple dimensions:
- **Unit Tests**: Jest-based tests for JavaScript modules (90%+ coverage target)
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
npm run test:accessibility  # Full a11y test suite
npm run test:a11y:axe       # Quick axe-core scan
```

### Run Performance Audits
```bash
npm run audit:lighthouse    # Full Lighthouse audit (generates HTML report)
npm run audit:lighthouse:json  # JSON output for CI/CD integration
```

---

## Unit Tests (Jest)

### Location
`tests/unit/` - All unit test files

### Test Files
- `header.test.js` - Header height measurement and font loading
- `polyfills.test.js` - IE11 requestAnimationFrame/cancelAnimationFrame shims
- `observer.test.js` - Intersection Observer and aria-current management
- `hero.test.js` - SVG topography generation (FBm algorithm)

### Coverage Targets
```
- Statements: 80% minimum
- Branches: 75% minimum
- Functions: 80% minimum
- Lines: 80% minimum
```

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
✅ DOM manipulation and CSS variable setting
✅ Error handling and edge cases
✅ Event listeners and observers
✅ Browser compatibility (polyfills)
✅ Font loading and async operations

### What's Excluded from Coverage
- `main.js` - Entry point (integration tested via E2E)
- `config.js` - Configuration object (used in unit tests)

---

## E2E Tests (Playwright)

### Location
`tests/e2e/` - Browser automation tests

### Test Files
- `main.spec.js` - Core functionality (routing, rendering, performance)
- `accessibility.spec.js` - WCAG AA compliance and keyboard navigation

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
- aria-current updates on scroll

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
- og:* tags for social sharing
- Canonical tag for SEO

---

## Accessibility Testing

### Manual Checks
```bash
# Start local server on port 8000
npx http-server . -p 8000 &

# Run axe accessibility scan
npm run test:a11y:axe
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
- Aim for 80%+ across all metrics

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

### Bundle Sizes
- CSS: 21.34 KB (minified)
- JavaScript: 9.43 KB (minified)
- Total: 30.77 KB
- Compression: -55.8%

### Load Time Targets
- First Contentful Paint (FCP): < 2s
- Largest Contentful Paint (LCP): < 3s
- Cumulative Layout Shift (CLS): < 0.1
- Total Blocking Time (TBT): < 200ms

### Lighthouse Targets
- Performance: 90+
- Accessibility: 95+
- Best Practices: 95+
- SEO: 100

---

## Continuous Improvement

### Coverage Goals
- Current: 85% (realistic, with polyfills + E2E)
- Target: 90%+ for new features
- Track changes in CI/CD reports

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

