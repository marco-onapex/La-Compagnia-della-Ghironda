import '../../js/main.js';
import { setupObserver } from '../../js/modules/observer.js';

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
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  // ─── setupObserver ─────────────────────────────────────────────────────────

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

  // ─── DOM integrity ─────────────────────────────────────────────────────────

  describe('Integration Tests - DOM Integrity', () => {
    test('should leave DOM structure intact after initialization', () => {
      setupObserver();

      expect(document.querySelector('.header')).not.toBeNull();
      expect(document.querySelector('.hero')).not.toBeNull();
      expect(document.querySelector('.hero h1')).not.toBeNull();
    });
  });
});
