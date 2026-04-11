/* global describe, test, beforeEach, afterEach, jest, expect, HTMLElement */
import { updateHeaderHeight, initHeaderListener } from '../../js/modules/header.js';
import { CONFIG } from '../../js/config.js';

describe('Header Module', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty(CONFIG.CSS_VARS.headerHeight);
    document.body.innerHTML = '<header class="header"></header>';

    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() { return this.classList.contains('header') ? 85 : 0; },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    delete HTMLElement.prototype.offsetHeight;
  });

  // ─── updateHeaderHeight ────────────────────────────────────────────────────

  describe('updateHeaderHeight()', () => {
    test('should write the real header offsetHeight to --header-height', () => {
      updateHeaderHeight();
      expect(document.documentElement.style.getPropertyValue(CONFIG.CSS_VARS.headerHeight)).toBe('85px');
    });

    test('should reflect a different height when the header grows', () => {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() { return this.classList.contains('header') ? 120 : 0; },
      });
      updateHeaderHeight();
      expect(document.documentElement.style.getPropertyValue(CONFIG.CSS_VARS.headerHeight)).toBe('120px');
    });

    test('should not set CSS variable when header element is absent', () => {
      document.body.innerHTML = '';
      updateHeaderHeight();
      expect(document.documentElement.style.getPropertyValue(CONFIG.CSS_VARS.headerHeight)).toBe('');
    });

    test('should not set CSS variable when offsetHeight is 0', () => {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() { return 0; },
      });
      updateHeaderHeight();
      expect(document.documentElement.style.getPropertyValue(CONFIG.CSS_VARS.headerHeight)).toBe('');
    });

    test('should not set CSS variable when offsetHeight is negative', () => {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() { return this.classList.contains('header') ? -10 : 0; },
      });
      updateHeaderHeight();
      expect(document.documentElement.style.getPropertyValue(CONFIG.CSS_VARS.headerHeight)).toBe('');
    });

    test('should not set CSS variable when offsetHeight is NaN', () => {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() { return this.classList.contains('header') ? NaN : 0; },
      });
      updateHeaderHeight();
      expect(document.documentElement.style.getPropertyValue(CONFIG.CSS_VARS.headerHeight)).toBe('');
    });
  });

  // ─── initHeaderListener ────────────────────────────────────────────────────

  describe('initHeaderListener()', () => {
    test('should set --header-height immediately on init', () => {
      initHeaderListener();
      expect(document.documentElement.style.getPropertyValue(CONFIG.CSS_VARS.headerHeight)).toBe('85px');
    });

    test('should update --header-height after window resize debounce expires', () => {
      jest.useFakeTimers();
      initHeaderListener();

      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() { return this.classList.contains('header') ? 120 : 0; },
      });

      window.dispatchEvent(new Event('resize'));
      jest.runAllTimers();

      expect(document.documentElement.style.getPropertyValue(CONFIG.CSS_VARS.headerHeight)).toBe('120px');
      jest.useRealTimers();
    });

    test('should call updateHeaderHeight again when fonts.ready resolves', async () => {
      Object.defineProperty(document.fonts, 'ready', {
        configurable: true,
        value: Promise.resolve(),
      });

      initHeaderListener(); // immediate call: 85px; queues fonts.ready.then microtask

      // Change height before the microtask runs
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() { return this.classList.contains('header') ? 120 : 0; },
      });

      // Flush microtask queue: fonts.ready.then fires → updateHeaderHeight → 120px
      await Promise.resolve();

      expect(document.documentElement.style.getPropertyValue(CONFIG.CSS_VARS.headerHeight)).toBe('120px');
    });

    test('should call updateHeaderHeight via fallback timeout when fonts.ready rejects', async () => {
      Object.defineProperty(document.fonts, 'ready', {
        configurable: true,
        value: Promise.reject(new Error('Font load failed')),
      });

      jest.useFakeTimers();
      initHeaderListener(); // immediate: 85px; rejection microtask queued

      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() { return this.classList.contains('header') ? 120 : 0; },
      });

      // The .then().catch() rejection chain takes multiple microtask ticks to propagate;
      // flush them all before advancing fake timers.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Advance past the fallback timeout
      jest.runAllTimers();

      expect(document.documentElement.style.getPropertyValue(CONFIG.CSS_VARS.headerHeight)).toBe('120px');
      jest.useRealTimers();
    });

    test('should handle missing document.fonts gracefully (IE11 path)', () => {
      initHeaderListener();
      // If we reach here without throwing, the guard works
      expect(document.documentElement.style.getPropertyValue(CONFIG.CSS_VARS.headerHeight)).toBe('85px');
    });
  });
});
