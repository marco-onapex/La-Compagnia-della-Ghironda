import { setupObserver, setupHeaderToggle } from '../../js/modules/observer.js';

// ─── main.js bootstrap ────────────────────────────────────────────────────
// --header-h is now CSS-only; main.js only bootstraps setupObserver.
// We import the module once to cover its top-level execution path.

describe('main module bootstrap', () => {
  beforeAll(async () => {
    document.body.innerHTML = `
      <header></header>
      <nav><a href="#sec1">Sec 1</a></nav>
      <section id="sec1"></section>
    `;
    global.IntersectionObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
    global.ResizeObserver    = jest.fn(() => ({ observe: jest.fn() }));
    jest.resetModules();
    await import('../../js/main.js');
  });

  afterAll(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('boots without error and initialises IntersectionObserver', () => {
    expect(global.IntersectionObserver).toHaveBeenCalled();
  });

  test('does not set --header-h (set by blocking inline script in index.html, not main.js)', () => {
    expect(document.documentElement.style.getPropertyValue('--header-h')).toBe('');
  });
});

// ─── setupObserver + DOM integrity ────────────────────────────────────────

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
        <h1></h1>
        <div class="ghironda-wrapper">
          <img class="ghironda-icon" src="test.jpg" />
        </div>
      </div>
      <nav>
        <a href="#sec1">Section 1</a>
      </nav>
      <section id="sec1"></section>
    `;

    mockObserverInstance = { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() };
    window.IntersectionObserver = jest.fn(() => mockObserverInstance);
    window.ResizeObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('Integration Tests - setupObserver', () => {
    test('should create IntersectionObserver instance', () => {
      setupObserver();
      expect(window.IntersectionObserver).toHaveBeenCalled();
    });

    test('should observe section with id', () => {
      setupObserver();
      expect(mockObserverInstance.observe).toHaveBeenCalledWith(document.querySelector('#sec1'));
    });
  });

  describe('Integration Tests - DOM Integrity', () => {
    test('should leave DOM structure intact after initialization', () => {
      setupObserver();

      expect(document.querySelector('.header')).not.toBeNull();
      expect(document.querySelector('.hero')).not.toBeNull();
      expect(document.querySelector('.hero h1')).not.toBeNull();
    });
  });

  describe('setupHeaderToggle', () => {
    test('creates an IntersectionObserver for .hero h1 with rootMargin', () => {
      setupHeaderToggle();
      expect(window.IntersectionObserver).toHaveBeenCalled();
      expect(mockObserverInstance.observe).toHaveBeenCalledWith(document.querySelector('.hero h1'));
      const [[, options]] = window.IntersectionObserver.mock.calls.slice(-1);
      expect(options.rootMargin).toMatch(/^-\d+px 0px 0px 0px$/);
    });

    test('adds .scrolled to .header-title-wrapper when h1 is not intersecting', () => {
      setupHeaderToggle();
      const [[callback]] = window.IntersectionObserver.mock.calls.slice(-1);
      const wrapper = document.querySelector('.header-title-wrapper');
      callback([{ isIntersecting: false }]);
      expect(wrapper.classList.contains('scrolled')).toBe(true);
    });

    test('removes .scrolled from .header-title-wrapper when h1 re-enters viewport', () => {
      setupHeaderToggle();
      const [[callback]] = window.IntersectionObserver.mock.calls.slice(-1);
      const wrapper = document.querySelector('.header-title-wrapper');
      callback([{ isIntersecting: false }]);
      callback([{ isIntersecting: true }]);
      expect(wrapper.classList.contains('scrolled')).toBe(false);
    });

    test('does not throw when .hero h1 is absent', () => {
      document.body.innerHTML = '<div></div>';
      expect(() => setupHeaderToggle()).not.toThrow();
    });
  });
});
