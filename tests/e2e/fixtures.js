/**
 * Playwright fixtures — Page Object Model for La Compagnia della Ghironda.
 *
 * Centralises the locators and the `goto` setup that every spec used to
 * duplicate. Each spec imports `test` from this module instead of from
 * `@playwright/test`; existing API (test/expect/describe) is unchanged.
 *
 * Locators are role-based per Playwright's official guidance:
 *   https://playwright.dev/docs/best-practices#use-locators
 * Role-based selectors decouple the tests from CSS class refactors and
 * surface accessibility regressions automatically (a button that loses
 * its accessible name fails the test).
 */

import { test as base, expect } from '@playwright/test';

/**
 * @typedef {object} HomePage
 * @property {import('@playwright/test').Page} page
 * @property {import('@playwright/test').Locator} skipLink
 * @property {import('@playwright/test').Locator} navToggle
 * @property {import('@playwright/test').Locator} nav
 * @property {import('@playwright/test').Locator} navLinks
 * @property {import('@playwright/test').Locator} header
 * @property {import('@playwright/test').Locator} hero
 * @property {import('@playwright/test').Locator} heroHeading
 * @property {(viewport?: { width: number; height: number }) => Promise<void>} open
 */

/**
 * @typedef {{ home: HomePage }} Fixtures
 */

export const test = /** @type {ReturnType<typeof base.extend<Fixtures>>} */ (
  base.extend({
    home: async ({ page }, use) => {
      const skipLink = page.getByRole('link', { name: /salta al contenuto/i });
      /* The nav toggle is a <label> wrapping a visually-hidden
         <input type="checkbox" class="nav-toggle-input">. The
         accessible element is the checkbox (label's aria-label
         propagates to it as the input's accessible name). */
      const navToggle = page.getByRole('checkbox', { name: /menu di navigazione/i });
      const nav = page.getByRole('navigation', { name: /navigazione/i });
      const navLinks = nav.getByRole('link');
      const header = page.locator('header'); // banner contains both header-container and nav
      const hero = page.locator('section.hero');
      const heroHeading = page.getByRole('heading', { level: 1 });

      const open = async (viewport) => {
        if (viewport) {
          await page.setViewportSize(viewport);
        }
        await page.goto('/');
        await page.waitForLoadState('load');
      };

      await use({ page, skipLink, navToggle, nav, navLinks, header, hero, heroHeading, open });
    },
  })
);

export { expect };
