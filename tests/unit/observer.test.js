import { setupObserver, setupNavToggle, setupHeaderHeight } from '../../js/modules/observer.js';

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

// ─── setupNavToggle ───────────────────────────────────────────────────────────

describe('setupNavToggle()', () => {
  let header, toggle, nav;

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = `
      <header>
        <div class="header-title-wrapper">
          <button class="nav-toggle" aria-expanded="false" aria-controls="main-nav">
            <span class="nav-toggle-bar"></span>
            <span class="nav-toggle-bar"></span>
            <span class="nav-toggle-bar"></span>
          </button>
        </div>
        <nav id="main-nav">
          <ul>
            <li><a href="#sec1">Section 1</a></li>
          </ul>
        </nav>
      </header>
    `;
    header = document.querySelector('header');
    toggle = document.querySelector('.nav-toggle');
    nav    = document.getElementById('main-nav');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('clicking toggle sets aria-expanded="true" and adds nav-open to header', () => {
    setupNavToggle();
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(header.classList.contains('nav-open')).toBe(true);
  });

  test('clicking toggle again collapses: aria-expanded="false", nav-open removed', () => {
    setupNavToggle();
    toggle.click();
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(header.classList.contains('nav-open')).toBe(false);
  });

  test('clicking a nav link collapses the nav', () => {
    setupNavToggle();
    toggle.click(); // open
    nav.querySelector('a').click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(header.classList.contains('nav-open')).toBe(false);
  });

  test('resize to desktop collapses nav if it was open', () => {
    jest.useFakeTimers();
    setupNavToggle();
    toggle.click(); // open
    // jsdom default innerWidth is 1024 — simulate resize event
    window.dispatchEvent(new Event('resize'));
    // The handler is debounced at 150ms — advance past the threshold
    jest.advanceTimersByTime(200);
    expect(header.classList.contains('nav-open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  test('returns early without throwing when toggle is missing', () => {
    toggle.remove();
    expect(() => setupNavToggle()).not.toThrow();
  });

  test('returns early without throwing when nav is missing', () => {
    nav.remove();
    expect(() => setupNavToggle()).not.toThrow();
  });
});

// ─── setupHeaderHeight ────────────────────────────────────────────────────────

describe('setupHeaderHeight()', () => {
  let mockResizeObserver, mockObserverInstance;

  beforeEach(() => {
    document.body.innerHTML = '<header></header>';
    mockObserverInstance = { observe: jest.fn() };
    mockResizeObserver = jest.fn(() => mockObserverInstance);
    window.ResizeObserver = mockResizeObserver;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.ResizeObserver;
    jest.clearAllMocks();
    document.documentElement.style.removeProperty('--header-h');
  });

  test('creates a ResizeObserver and observes the header', () => {
    setupHeaderHeight();
    expect(mockResizeObserver).toHaveBeenCalledTimes(1);
    expect(mockObserverInstance.observe).toHaveBeenCalledWith(document.querySelector('header'));
  });

  test('ResizeObserver callback updates --header-h on root element', () => {
    let capturedCb;
    window.ResizeObserver = jest.fn((cb) => { capturedCb = cb; return mockObserverInstance; });
    Object.defineProperty(document.querySelector('header'), 'offsetHeight', {
      configurable: true, get() { return 76; },
    });
    setupHeaderHeight();
    capturedCb();
    expect(document.documentElement.style.getPropertyValue('--header-h')).toBe('76px');
  });

  test('returns early without throwing when ResizeObserver is unavailable', () => {
    delete window.ResizeObserver;
    expect(() => setupHeaderHeight()).not.toThrow();
  });
});
