/* global describe, test, beforeEach, afterEach, jest, expect */
import { setupObserver, __resetObserverState } from '../../js/modules/observer.js';

describe('Observer Module', () => {
  let mockHeroObserver;
  let mockSectionObserver;

  beforeEach(() => {
    __resetObserverState();
    document.body.innerHTML = `
      <div class="hero">
        <h1 class="hero-title"></h1>
      </div>
      <header class="header">
        <div class="header-title-wrapper">
          <a class="header-title-link" href="#"></a>
        </div>
      </header>
      <nav>
        <a href="#sec1">Section 1</a>
        <a href="#sec2">Section 2</a>
      </nav>
      <section id="sec1"></section>
      <section id="sec2"></section>
    `;

    mockHeroObserver = { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() };
    mockSectionObserver = { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() };

    let callCount = 0;
    window.IntersectionObserver = jest.fn((callback) => {
      callCount += 1;
      if (callCount === 1) {
        mockHeroObserver.callback = callback;
        return mockHeroObserver;
      }
      mockSectionObserver.callback = callback;
      return mockSectionObserver;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  // ─── Hero Title Observer ───────────────────────────────────────────────────

  describe('setupObserver() - Hero Title Observer', () => {
    test('should observe the .hero-title element', () => {
      setupObserver();
      const heroTitle = document.querySelector('.hero-title');
      expect(mockHeroObserver.observe).toHaveBeenCalledWith(heroTitle);
    });

    test('should show header title with correct aria attrs when hero has <20% intersection', () => {
      setupObserver();
      const wrapper = document.querySelector('.header-title-wrapper');
      const link = document.querySelector('.header-title-link');

      mockHeroObserver.callback([{
        intersectionRatio: 0.1,
        target: document.querySelector('.hero-title'),
      }]);

      expect(wrapper.classList.contains('visible')).toBe(true);
      expect(link.getAttribute('aria-hidden')).toBe('false');
      expect(link.getAttribute('tabindex')).toBe('0');
    });

    test('should hide header title with correct aria attrs when hero has >=20% intersection', () => {
      setupObserver();
      const wrapper = document.querySelector('.header-title-wrapper');
      const link = document.querySelector('.header-title-link');

      // Show first
      mockHeroObserver.callback([{ intersectionRatio: 0.1, target: document.querySelector('.hero-title') }]);
      expect(wrapper.classList.contains('visible')).toBe(true);

      // Then hide
      mockHeroObserver.callback([{ intersectionRatio: 0.3, target: document.querySelector('.hero-title') }]);

      expect(wrapper.classList.contains('visible')).toBe(false);
      expect(link.getAttribute('aria-hidden')).toBe('true');
      expect(link.getAttribute('tabindex')).toBe('-1');
    });

    test('should not mutate DOM on repeated callbacks with the same intersection state', () => {
      setupObserver();
      const wrapper = document.querySelector('.header-title-wrapper');
      const addSpy = jest.spyOn(wrapper.classList, 'add');
      const removeSpy = jest.spyOn(wrapper.classList, 'remove');
      const heroTitle = document.querySelector('.hero-title');

      // State change false→true: one add
      mockHeroObserver.callback([{ intersectionRatio: 0.1, target: heroTitle }]);
      expect(addSpy).toHaveBeenCalledTimes(1);

      // Same direction again: cache prevents second DOM write
      mockHeroObserver.callback([{ intersectionRatio: 0.05, target: heroTitle }]);
      expect(addSpy).toHaveBeenCalledTimes(1);

      // State change true→false: one remove
      mockHeroObserver.callback([{ intersectionRatio: 0.5, target: heroTitle }]);
      expect(removeSpy).toHaveBeenCalledTimes(1);

      // Same direction again: cache prevents second DOM write
      mockHeroObserver.callback([{ intersectionRatio: 0.8, target: heroTitle }]);
      expect(removeSpy).toHaveBeenCalledTimes(1);
    });

    test('should not throw when header title link is absent', () => {
      document.querySelector('.header-title-link').remove();
      setupObserver();

      expect(() => {
        mockHeroObserver.callback([{
          intersectionRatio: 0.1,
          target: document.querySelector('.hero-title'),
        }]);
      }).not.toThrow();

      // Wrapper still becomes visible even without the link
      expect(document.querySelector('.header-title-wrapper').classList.contains('visible')).toBe(true);
    });
  });

  // ─── Section Navigation Observer ──────────────────────────────────────────

  describe('setupObserver() - Section Navigation Observer', () => {
    test('should create two IntersectionObserver instances (hero + sections)', () => {
      setupObserver();
      expect(window.IntersectionObserver).toHaveBeenCalledTimes(2);
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

  // ─── rootMargin from --header-height ──────────────────────────────────────

  describe('setupObserver() - rootMargin from --header-height', () => {
    test('should use --header-height CSS variable as the section observer top margin', () => {
      document.documentElement.style.setProperty('--header-height', '100px');
      setupObserver();

      const sectionObserverOptions = window.IntersectionObserver.mock.calls[1][1];
      expect(sectionObserverOptions.rootMargin).toBe('-100px 0px -66% 0px');

      document.documentElement.style.removeProperty('--header-height');
    });

    test('should fall back to -85px top margin when --header-height is not set', () => {
      document.documentElement.style.removeProperty('--header-height');
      setupObserver();

      const sectionObserverOptions = window.IntersectionObserver.mock.calls[1][1];
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

    test('should not throw when .hero-title is absent', () => {
      document.querySelector('.hero-title').remove();
      expect(() => setupObserver()).not.toThrow();
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
