/* global describe, test, beforeEach, afterEach, jest, expect, HTMLElement, Element */
import '../../js/main.js';
import { initHeaderListener } from '../../js/modules/header.js';
import { setupObserver } from '../../js/modules/observer.js';
import { setupHeroCircles } from '../../js/modules/hero.js';

describe('Main Module Integration', () => {
  let mockObserverInstance;

  beforeEach(() => {
    document.body.innerHTML = `
      <header class="header">
        <div class="header-title-wrapper">
          <a class="header-title-link" href="#" tabindex="-1" aria-hidden="true"></a>
        </div>
      </header>
      <div class="hero" style="width: 800px; height: 600px;">
        <h1 class="hero-title"></h1>
        <div class="ghironda-wrapper">
          <img class="ghironda-icon" src="test.jpg" />
        </div>
      </div>
      <nav>
        <a href="#sec1">Section 1</a>
      </nav>
      <section id="sec1"></section>
    `;

    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() { return 85; },
    });

    window.requestIdleCallback = jest.fn((cb) => {
      setTimeout(cb, 0);
    });

    mockObserverInstance = { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() };
    window.IntersectionObserver = jest.fn(() => mockObserverInstance);

    const img = document.querySelector('.ghironda-icon');
    if (img) {
      Object.defineProperty(img, 'complete', { configurable: true, value: true });
      Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 200 });
    }

    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 200,
      left: 300,
      top: 200,
      right: 500,
      bottom: 400,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete HTMLElement.prototype.offsetHeight;
    jest.clearAllMocks();
  });

  // ─── initHeaderListener ────────────────────────────────────────────────────

  describe('Integration Tests - initHeaderListener', () => {
    test('should set --header-height CSS variable on init', () => {
      initHeaderListener();
      expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('85px');
    });

    test('should update --header-height on window resize after debounce', () => {
      jest.useFakeTimers();
      initHeaderListener();

      // Change the mock height
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() { return 120; },
      });

      window.dispatchEvent(new Event('resize'));
      jest.runAllTimers();

      expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('120px');
      jest.useRealTimers();
    });
  });

  // ─── setupObserver ─────────────────────────────────────────────────────────

  describe('Integration Tests - setupObserver', () => {
    test('should create IntersectionObserver instances', () => {
      setupObserver();
      expect(window.IntersectionObserver).toHaveBeenCalled();
    });

    test('should observe the .hero-title element', () => {
      setupObserver();
      const heroTitle = document.querySelector('.hero-title');
      expect(mockObserverInstance.observe).toHaveBeenCalledWith(heroTitle);
    });
  });

  // ─── setupHeroCircles ──────────────────────────────────────────────────────

  describe('Integration Tests - setupHeroCircles', () => {
    test('should set --ghironda-circles CSS variable to a valid SVG data URL', () => {
      setupHeroCircles();
      const value = document.querySelector('.ghironda-wrapper').style.getPropertyValue('--ghironda-circles');
      expect(value).toMatch(/^url\('data:image\/svg\+xml;utf8,/);
    });

    test('should set --circle-size CSS variable to a pixel value', () => {
      setupHeroCircles();
      const circleSize = document.querySelector('.ghironda-wrapper').style.getPropertyValue('--circle-size');
      expect(circleSize).toMatch(/^\d+px$/);
    });
  });

  // ─── Module initialisation via requestIdleCallback ─────────────────────────

  describe('Integration Tests - Module Initialization', () => {
    test('should execute setupHeroCircles deferred via requestIdleCallback', () => {
      jest.useFakeTimers();

      jest.isolateModules(() => {
        // eslint-disable-next-line global-require
        require('../../js/main.js');
        // requestIdleCallback mock wraps cb in setTimeout(0) → advance timers
        jest.runAllTimers();
      });

      const wrapper = document.querySelector('.ghironda-wrapper');
      // The deferred call must have actually generated the SVG, not just left DOM intact
      expect(wrapper.style.getPropertyValue('--ghironda-circles')).toMatch(
        /^url\('data:image\/svg\+xml;utf8,/,
      );

      jest.useRealTimers();
    });
  });

  // ─── Full Sequence ─────────────────────────────────────────────────────────

  describe('Integration Tests - Full Sequence', () => {
    test('should set all expected CSS variables when all three functions run', () => {
      initHeaderListener();
      setupObserver();
      setupHeroCircles();

      expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('85px');
      expect(
        document.querySelector('.ghironda-wrapper').style.getPropertyValue('--ghironda-circles'),
      ).toMatch(/^url\('data:image\/svg\+xml;utf8,/);
    });

    test('should leave DOM structure intact after initialization', () => {
      initHeaderListener();
      setupObserver();
      setupHeroCircles();

      expect(document.querySelector('.header')).not.toBeNull();
      expect(document.querySelector('.hero')).not.toBeNull();
      expect(document.querySelector('.hero-title')).not.toBeNull();
    });
  });
});
