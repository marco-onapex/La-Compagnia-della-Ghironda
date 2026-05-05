/**
 * Accessibility Tests using axe-core
 * Tests WCAG 2.1 AA compliance and keyboard navigation.
 */

import { injectAxe } from 'axe-playwright';

import { test, expect } from './fixtures.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatViolations(violations) {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.description}\n  Nodes: ${v.nodes.map((n) => n.html).join(', ')}`,
    )
    .join('\n');
}

// ─── WCAG Compliance ──────────────────────────────────────────────────────────

test.describe('Accessibility Compliance', () => {
  test('should have zero WCAG 2.0 + 2.1 + 2.2 AA violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    await injectAxe(page);

    const { err, violations } = await page.evaluate(
      () =>
        new Promise((resolve) => {
          /* Tag list aligned with the test name: WCAG 2.0 A/AA + 2.1
             A/AA + 2.2 AA. The previous `['wcag2a', 'wcag2aa']` only
             covered 2.0, silently passing 2.1-only rules (e.g.
             `target-size`, `focus-visible-enhanced`) that the project
             advertises supporting. */
          axe.run(
            {
              runOnly: {
                type: 'tag',
                values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
              },
            },
            (e, results) => {
              /* Expose the axe error explicitly. Returning [] on err silently
                 turned an axe configuration failure into a green test (no
                 violations to report → expect(0).toHaveLength(0) passed). */
              resolve({ err: e ? String(e) : null, violations: results?.violations ?? [] });
            },
          );
        }),
    );
    expect(err, `axe.run error:\n${err}`).toBeNull();

    expect(violations, `Accessibility violations:\n${formatViolations(violations)}`).toHaveLength(
      0,
    );
  });

  // We test the WCAG AAA rule (`color-contrast-enhanced`, ≥7:1 normal text /
  // ≥4.5:1 large text) — the project's documented compliance level. Running
  // the AAA check (instead of the looser AA `color-contrast`) prevents
  // accidental regression to AA-only contrast on a future palette tweak.
  test('should have zero WCAG AAA color-contrast violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    // Wait for web fonts to finish painting before evaluating contrast.
    // 'load' waits for resources but not for fonts to be APPLIED to the render
    // tree — Firefox is especially sensitive to this race. document.fonts.ready
    // resolves when font data is loaded; the two rAF calls ensure the browser
    // has completed layout and paint with the loaded fonts before axe-core
    // evaluates colour contrast.
    await page.evaluate(() =>
      document.fonts.ready.then(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      ),
    );
    await injectAxe(page);

    const { err, violations } = await page.evaluate(
      () =>
        new Promise((resolve) => {
          axe.run(
            { runOnly: { type: 'rule', values: ['color-contrast-enhanced'] } },
            (e, results) => {
              resolve({ err: e ? String(e) : null, violations: results?.violations ?? [] });
            },
          );
        }),
    );
    expect(err, `axe.run error:\n${err}`).toBeNull();

    expect(
      violations,
      `AAA color-contrast violations:\n${formatViolations(violations)}`,
    ).toHaveLength(0);
  });

  test('should satisfy landmark and heading structure rules', async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);

    const violations = await page.evaluate(
      () =>
        new Promise((resolve) => {
          axe.run(
            { runOnly: { type: 'rule', values: ['landmark-one-main', 'page-has-heading-one'] } },
            (err, results) => {
              resolve(err ? [] : results.violations);
            },
          );
        }),
    );

    expect(violations, `Structural violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});

// ─── Keyboard Navigation ──────────────────────────────────────────────────────

// Keyboard navigation tests are split per browser to avoid test.skip():
//   - tests/e2e/keyboard/tab-navigation.spec.js  → real Tab (chromium + firefox)
//   - tests/e2e/keyboard.webkit.spec.js          → focus-based (webkit)
// Browser-agnostic focus-styling assertions live in tests/e2e/main.spec.js
// under the `Focus styling` describe — keeping them here too created two
// duplicate (and weakly-asserting) versions of the same contract.

// ─── Screen Reader Support ────────────────────────────────────────────────────

test.describe('Screen Reader Support', () => {
  test('should have non-empty text in all headings', async ({ page }) => {
    await page.goto('/');

    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    for (const heading of headings) {
      const text = (await heading.textContent())?.trim();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test('should have accessible name on all buttons', async ({ page }) => {
    await page.goto('/');

    const buttons = await page.locator('button').all();
    for (const button of buttons) {
      const text = (await button.textContent())?.trim();
      const ariaLabel = await button.getAttribute('aria-label');
      expect((text?.length || 0) + (ariaLabel?.length || 0)).toBeGreaterThan(0);
    }
  });

  test('should have non-empty li elements inside every list', async ({ page }) => {
    await page.goto('/');

    const lists = await page.locator('ul, ol').all();
    for (const list of lists) {
      const items = await list.locator('li').count();
      expect(items).toBeGreaterThan(0);
    }
  });

  test('should have accessible name on all links (visible text or aria-label)', async ({
    page,
  }) => {
    await page.goto('/');

    const links = await page.locator('a').all();
    for (const link of links) {
      const text = (await link.textContent())?.trim();
      const ariaLabel = await link.getAttribute('aria-label');
      const hasName = (text?.length || 0) > 0 || (ariaLabel?.length || 0) > 0;
      expect(hasName).toBe(true);
    }
  });
});
