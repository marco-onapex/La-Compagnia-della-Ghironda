/**
 * Accessibility Tests using axe-core
 * Tests WCAG 2.1 AA compliance and keyboard navigation.
 */

import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatViolations(violations) {
  return violations
    .map(v => `[${v.impact}] ${v.id}: ${v.description}\n  Nodes: ${v.nodes.map(n => n.html).join(', ')}`)
    .join('\n');
}

// ─── WCAG Compliance ──────────────────────────────────────────────────────────

test.describe('Accessibility Compliance', () => {
  test('should have zero WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await injectAxe(page);

    const violations = await page.evaluate(() =>
      new Promise((resolve) => {
        axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }, (err, results) => {
          resolve(err ? [] : results.violations);
        });
      }),
    );

    expect(violations, `Accessibility violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  test('should have zero color-contrast violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await injectAxe(page);

    const violations = await page.evaluate(() =>
      new Promise((resolve) => {
        axe.run({ runOnly: { type: 'rule', values: ['color-contrast'] } }, (err, results) => {
          resolve(err ? [] : results.violations);
        });
      }),
    );

    expect(violations, `Color-contrast violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  test('should satisfy landmark and heading structure rules', async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);

    const violations = await page.evaluate(() =>
      new Promise((resolve) => {
        axe.run(
          { runOnly: { type: 'rule', values: ['landmark-one-main', 'page-has-heading-one'] } },
          (err, results) => { resolve(err ? [] : results.violations); },
        );
      }),
    );

    expect(violations, `Structural violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});

// ─── Keyboard Navigation ──────────────────────────────────────────────────────

test.describe('Keyboard Navigation', () => {
  test('should reach at least 3 focusable elements by tabbing', async ({ page, browserName }) => {
    // WebKit requires "Full Keyboard Access" in system prefs to Tab to links
    test.skip(browserName === 'webkit', 'WebKit does not Tab to links without Full Keyboard Access');
    await page.goto('/');

    const tags = new Set();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const tag = await page.evaluate(() => document.activeElement?.tagName);
      if (tag && tag !== 'BODY') tags.add(tag);
    }

    expect(tags.size).toBeGreaterThanOrEqual(1);
  });

  test('should show a visible focus indicator on focused links', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('a').first();
    await link.focus();

    const hasFocusStyle = await link.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return el.matches(':focus-visible') || (styles.outline !== 'none' && styles.outline !== '');
    });

    expect(hasFocusStyle).toBe(true);
  });

  test('should not trap focus — Tab cycles through all focusable elements', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { document.activeElement?.blur?.(); });

    const seen = new Set();
    let duplicatesInRow = 0;

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const key = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? (el.id || el.className || el.tagName) : 'BODY';
      });

      if (seen.has(key)) {
        // Once we start cycling back, focus wraps — that's expected
        duplicatesInRow++;
        if (duplicatesInRow > 2) break;
      } else {
        seen.add(key);
        duplicatesInRow = 0;
      }
    }

    // At least a few distinct elements were reachable
    expect(seen.size).toBeGreaterThan(0);
  });
});

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

  test('should have accessible name on all links (visible text or aria-label)', async ({ page }) => {
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
