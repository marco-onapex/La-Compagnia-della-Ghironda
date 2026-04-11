/* global describe, test, beforeEach, afterEach, jest, expect, Element */
import { setupHeroCircles } from '../../js/modules/hero.js';

describe('Hero Module', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="hero" style="width: 800px; height: 600px; position: relative;">
        <div class="ghironda-wrapper" style="width: 400px; height: 400px;">
          <img class="ghironda-icon" src="test.jpg" width="200" height="200" />
        </div>
      </div>
    `;

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
    jest.clearAllMocks();
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function makeImageComplete() {
    const img = document.querySelector('.ghironda-icon');
    Object.defineProperty(img, 'complete', { configurable: true, value: true });
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 200 });
    return img;
  }

  function decodeSvg(cssVarValue) {
    const encoded = cssVarValue.match(/data:image\/svg\+xml;utf8,([^']+)/)[1];
    return decodeURIComponent(encoded);
  }

  // ─── SVG Generation ────────────────────────────────────────────────────────

  describe('setupHeroCircles() - SVG Generation', () => {
    test('should set --ghironda-circles to a valid SVG data URL', () => {
      makeImageComplete();
      setupHeroCircles();

      const value = document.querySelector('.ghironda-wrapper').style.getPropertyValue('--ghironda-circles');
      expect(value).toMatch(/^url\('data:image\/svg\+xml;utf8,/);
      expect(value).toMatch(/'\)$/);
    });

    test('should set --circle-size to a pixel value', () => {
      makeImageComplete();
      setupHeroCircles();

      const circleSize = document.querySelector('.ghironda-wrapper').style.getPropertyValue('--circle-size');
      expect(circleSize).toMatch(/^\d+px$/);
    });

    test('should embed a well-formed SVG with 9 fill paths and 9 stroke paths (18 total)', () => {
      makeImageComplete();
      setupHeroCircles();

      const value = document.querySelector('.ghironda-wrapper').style.getPropertyValue('--ghironda-circles');
      const svg = decodeSvg(value);

      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      // 9 concentric circles x 2 paths each (fill + stroke)
      expect((svg.match(/<path/g) || []).length).toBe(18);
    });

    test('should use infernal palette from outer (#8B3A3A) to inner (#0a0000)', () => {
      makeImageComplete();
      setupHeroCircles();

      const svg = decodeSvg(
        document.querySelector('.ghironda-wrapper').style.getPropertyValue('--ghironda-circles'),
      );

      expect(svg).toContain('#8B3A3A'); // outermost: palette index 0
      expect(svg).toContain('#0a0000'); // innermost: palette index 8
    });

    test('should not write CSS variables when image has zero dimensions (schedules RAF retry)', () => {
      makeImageComplete();
      jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0,
      });

      const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);

      setupHeroCircles();

      expect(rafSpy).toHaveBeenCalled();

      const wrapper = document.querySelector('.ghironda-wrapper');
      // No CSS variables must be written before dimensions are known
      expect(wrapper.style.getPropertyValue('--ghironda-circles')).toBe('');
      expect(wrapper.style.getPropertyValue('--circle-size')).toBe('');

      rafSpy.mockRestore();
    });
  });

  // ─── Event Listeners ───────────────────────────────────────────────────────

  describe('setupHeroCircles() - Event Listeners', () => {
    test('should generate SVG immediately when image is already loaded', () => {
      makeImageComplete();
      setupHeroCircles();

      const value = document.querySelector('.ghironda-wrapper').style.getPropertyValue('--ghironda-circles');
      expect(value).toMatch(/^url\('data:image\/svg\+xml;utf8,/);
    });

    test('should generate SVG after image fires its load event', () => {
      const img = document.querySelector('.ghironda-icon');
      Object.defineProperty(img, 'complete', { configurable: true, value: false });
      Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 200 });

      setupHeroCircles();

      // Before load fires: no SVG
      expect(document.querySelector('.ghironda-wrapper').style.getPropertyValue('--ghironda-circles')).toBe('');

      img.dispatchEvent(new Event('load'));

      const value = document.querySelector('.ghironda-wrapper').style.getPropertyValue('--ghironda-circles');
      expect(value).toMatch(/^url\('data:image\/svg\+xml;utf8,/);
    });

    test('should regenerate SVG after resize debounce expires', () => {
      makeImageComplete();
      jest.useFakeTimers();
      setupHeroCircles();

      const wrapper = document.querySelector('.ghironda-wrapper');

      // Update dimensions so regeneration produces a non-empty SVG
      jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 300, height: 300, left: 100, top: 50, right: 400, bottom: 350,
      });

      window.dispatchEvent(new Event('resize'));
      jest.runAllTimers();

      const afterResize = wrapper.style.getPropertyValue('--ghironda-circles');
      expect(afterResize).toMatch(/^url\('data:image\/svg\+xml;utf8,/);

      jest.useRealTimers();
    });
  });

  // ─── Error Handling ────────────────────────────────────────────────────────

  describe('setupHeroCircles() - Error Handling', () => {
    test('should not throw when .ghironda-icon is absent', () => {
      document.querySelector('.ghironda-icon').remove();
      expect(() => setupHeroCircles()).not.toThrow();
    });

    test('should not throw when .ghironda-wrapper is absent', () => {
      document.querySelector('.ghironda-wrapper').remove();
      expect(() => setupHeroCircles()).not.toThrow();
    });

    test('should not throw when image has no .hero ancestor', () => {
      makeImageComplete();
      const img = document.querySelector('.ghironda-icon');
      img.closest = jest.fn(() => null);
      expect(() => setupHeroCircles()).not.toThrow();
      img.closest = HTMLElement.prototype.closest;
    });

    test('should not throw when getBoundingClientRect throws', () => {
      makeImageComplete();
      jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => {
        throw new Error('Layout unavailable');
      });
      expect(() => setupHeroCircles()).not.toThrow();
    });
  });
});
