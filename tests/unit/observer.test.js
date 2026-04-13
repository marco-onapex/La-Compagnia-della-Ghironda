import { setupObserver } from '../../js/modules/observer.js';

describe('Observer Module', () => {
  let mockSectionObserver;

  beforeEach(() => {
    document.body.innerHTML = `
      <header class="header">
        <div class="header-title-wrapper">
          <a class="header-title-link" href="#"></a>
        </div>
      </header>
      <div class="hero">
        <h1 class="hero-title"></h1>
      </div>
      <nav>
        <a href="#sec1">Section 1</a>
        <a href="#sec2">Section 2</a>
      </nav>
      <section id="sec1"></section>
      <section id="sec2"></section>
    `;

    mockSectionObserver = { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() };

    window.IntersectionObserver = jest.fn((callback) => {
      mockSectionObserver.callback = callback;
      return mockSectionObserver;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  // ─── Section Navigation Observer ──────────────────────────────────────────

  describe('setupObserver() - Section Navigation Observer', () => {
    test('should create one IntersectionObserver instance (sections only)', () => {
      setupObserver();
      expect(window.IntersectionObserver).toHaveBeenCalledTimes(1);
    });

    test('should observe every section that has an id', () => {
      setupObserver();
      expect(mockSectionObserver.observe).toHaveBeenCalledWith(document.querySelector('#sec1'));
      expect(mockSectionObserver.observe).toHaveBeenCalledWith(document.querySelector('#sec2'));
    });

    test('should set aria-current="page" on the link for the intersecting section', () => {
      setupObserver();
      const link1 = document.querySelector('a[href="#sec1"]');
      const link2 = document.querySelector('a[href="#sec2"]');

      mockSectionObserver.callback([{ isIntersecting: true, target: document.querySelector('#sec1') }]);

      expect(link1.getAttribute('aria-current')).toBe('page');
      expect(link2.hasAttribute('aria-current')).toBe(false);
    });

    test('should transfer aria-current from old active section to new one', () => {
      setupObserver();
      const link1 = document.querySelector('a[href="#sec1"]');
      const link2 = document.querySelector('a[href="#sec2"]');

      mockSectionObserver.callback([{ isIntersecting: true, target: document.querySelector('#sec1') }]);
      expect(link1.getAttribute('aria-current')).toBe('page');

      mockSectionObserver.callback([{ isIntersecting: true, target: document.querySelector('#sec2') }]);
      expect(link1.hasAttribute('aria-current')).toBe(false);
      expect(link2.getAttribute('aria-current')).toBe('page');
    });

    test('should remove aria-current when section exits viewport (isIntersecting: false)', () => {
      setupObserver();
      const link1 = document.querySelector('a[href="#sec1"]');

      // Section enters
      mockSectionObserver.callback([{ isIntersecting: true, target: document.querySelector('#sec1') }]);
      expect(link1.getAttribute('aria-current')).toBe('page');

      // Section exits
      mockSectionObserver.callback([{ isIntersecting: false, target: document.querySelector('#sec1') }]);
      expect(link1.hasAttribute('aria-current')).toBe(false);
    });

    test('should have no active nav links when user is in hero (no sections intersecting)', () => {
      setupObserver();
      const link1 = document.querySelector('a[href="#sec1"]');
      const link2 = document.querySelector('a[href="#sec2"]');

      // Simulate hero: all sections exit viewport
      mockSectionObserver.callback([{ isIntersecting: false, target: document.querySelector('#sec1') }]);
      mockSectionObserver.callback([{ isIntersecting: false, target: document.querySelector('#sec2') }]);

      expect(link1.hasAttribute('aria-current')).toBe(false);
      expect(link2.hasAttribute('aria-current')).toBe(false);
    });
  });

  // ─── rootMargin from header.offsetHeight ──────────────────────────────────

  describe('setupObserver() - rootMargin from header.offsetHeight', () => {
    test('should use header.offsetHeight as the section observer top margin', () => {
      Object.defineProperty(document.querySelector('header'), 'offsetHeight', {
        configurable: true,
        get() { return 100; },
      });
      setupObserver();

      const sectionObserverOptions = window.IntersectionObserver.mock.calls[0][1];
      expect(sectionObserverOptions.rootMargin).toBe('-100px 0px -66% 0px');
    });

    test('should fall back to -85px top margin when header.offsetHeight is 0', () => {
      // jsdom returns 0 for offsetHeight by default
      setupObserver();

      const sectionObserverOptions = window.IntersectionObserver.mock.calls[0][1];
      expect(sectionObserverOptions.rootMargin).toBe('-85px 0px -66% 0px');
    });
  });

  // ─── Error Handling ────────────────────────────────────────────────────────

  describe('setupObserver() - Error Handling', () => {
    test('should return early when IntersectionObserver is unavailable', () => {
      const saved = window.IntersectionObserver;
      delete window.IntersectionObserver;
      expect(() => setupObserver()).not.toThrow();
      window.IntersectionObserver = saved;
    });

    test('should not create section observer when there are no nav links', () => {
      document.querySelectorAll('nav a').forEach(el => el.remove());
      setupObserver();
      expect(mockSectionObserver.observe).not.toHaveBeenCalled();
    });

    test('should not create section observer when there are no sections with an id', () => {
      document.querySelectorAll('section').forEach(el => el.remove());
      setupObserver();
      expect(mockSectionObserver.observe).not.toHaveBeenCalled();
    });

    test('should not update aria-current for sections not referenced by any nav link', () => {
      const orphan = document.createElement('section');
      orphan.id = 'orphan';
      document.body.appendChild(orphan);

      setupObserver();

      mockSectionObserver.callback([{ isIntersecting: true, target: orphan }]);

      expect(document.querySelector('a[href="#sec1"]').hasAttribute('aria-current')).toBe(false);
      expect(document.querySelector('a[href="#sec2"]').hasAttribute('aria-current')).toBe(false);
    });
  });
});
