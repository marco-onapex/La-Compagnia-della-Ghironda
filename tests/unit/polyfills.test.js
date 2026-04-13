import { installRequestAnimationFramePolyfill } from '../../js/modules/polyfills.js';

describe('Polyfills Module', () => {
  let originalRAF;
  let originalCAF;

  beforeEach(() => {
    originalRAF = window.requestAnimationFrame;
    originalCAF = window.cancelAnimationFrame;
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
    jest.clearAllMocks();
  });

  describe('installRequestAnimationFramePolyfill()', () => {
    // ─── Polyfill installation ───────────────────────────────────────────────

    test('should install RAF when it does not exist', () => {
      delete window.requestAnimationFrame;
      installRequestAnimationFramePolyfill();
      expect(typeof window.requestAnimationFrame).toBe('function');
    });

    test('should install CAF when it does not exist', () => {
      delete window.cancelAnimationFrame;
      installRequestAnimationFramePolyfill();
      expect(typeof window.cancelAnimationFrame).toBe('function');
    });

    test('should not overwrite an existing RAF implementation', () => {
      const existingRAF = jest.fn();
      window.requestAnimationFrame = existingRAF;
      installRequestAnimationFramePolyfill();
      expect(window.requestAnimationFrame).toBe(existingRAF);
    });

    test('should not overwrite an existing CAF implementation', () => {
      const existingCAF = jest.fn();
      window.cancelAnimationFrame = existingCAF;
      installRequestAnimationFramePolyfill();
      expect(window.cancelAnimationFrame).toBe(existingCAF);
    });

    // ─── Polyfill behaviour ──────────────────────────────────────────────────

    test('RAF polyfill should return a numeric ID', () => {
      delete window.requestAnimationFrame;
      installRequestAnimationFramePolyfill();

      const id = window.requestAnimationFrame(() => {});
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    test('RAF polyfill should return unique IDs for each call', () => {
      delete window.requestAnimationFrame;
      installRequestAnimationFramePolyfill();

      const id1 = window.requestAnimationFrame(() => {});
      const id2 = window.requestAnimationFrame(() => {});
      const id3 = window.requestAnimationFrame(() => {});

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    test('RAF polyfill should execute the callback', (done) => {
      delete window.requestAnimationFrame;
      installRequestAnimationFramePolyfill();

      const callback = jest.fn();
      window.requestAnimationFrame(callback);

      setTimeout(() => {
        expect(callback).toHaveBeenCalled();
        done();
      }, 50);
    });

    test('CAF polyfill should prevent the callback from executing', (done) => {
      delete window.requestAnimationFrame;
      delete window.cancelAnimationFrame;
      installRequestAnimationFramePolyfill();

      const callback = jest.fn();
      const id = window.requestAnimationFrame(callback);
      window.cancelAnimationFrame(id);

      setTimeout(() => {
        expect(callback).not.toHaveBeenCalled();
        done();
      }, 50);
    });

    test('CAF polyfill should not throw for unknown numeric IDs', () => {
      delete window.cancelAnimationFrame;
      installRequestAnimationFramePolyfill();
      expect(() => window.cancelAnimationFrame(99999)).not.toThrow();
    });

    test('RAF polyfill should return null for non-function callbacks', () => {
      delete window.requestAnimationFrame;
      installRequestAnimationFramePolyfill();
      expect(window.requestAnimationFrame('not a function')).toBeNull();
    });

    test('CAF polyfill should silently ignore non-numeric IDs', () => {
      delete window.cancelAnimationFrame;
      installRequestAnimationFramePolyfill();
      expect(() => window.cancelAnimationFrame('not a number')).not.toThrow();
      expect(() => window.cancelAnimationFrame(null)).not.toThrow();
      expect(() => window.cancelAnimationFrame(undefined)).not.toThrow();
    });

    test('multiple RAF polyfill callbacks should execute in registration order', (done) => {
      delete window.requestAnimationFrame;
      installRequestAnimationFramePolyfill();

      const order = [];
      window.requestAnimationFrame(() => order.push(1));
      window.requestAnimationFrame(() => order.push(2));
      window.requestAnimationFrame(() => order.push(3));

      setTimeout(() => {
        expect(order).toEqual([1, 2, 3]);
        done();
      }, 50);
    });
  });
});
