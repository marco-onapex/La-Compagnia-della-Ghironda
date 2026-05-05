/**
 * Test for js/modules/header-toggle.js — fallback observer that
 * restores the skip-link ↔ title-link cross-fade on browsers that
 * lack `animation-timeline: view()` support.
 *
 * Coverage targets every gate:
 *   - feature gate matches @supports query (return early)
 *   - typeof CSS undefined (no return — proceed to next gate)
 *   - CSS.supports missing (no return)
 *   - typeof IntersectionObserver undefined (return)
 *   - .hero h1 missing (return)
 *   - happy path — observe + toggle on enter / exit
 */

import { setupHeaderToggle } from '../../js/modules/header-toggle.js';

const ORIGINAL_CSS = global.CSS;
const ORIGINAL_IO = global.IntersectionObserver;

function fakeIntersectionObserver() {
  /* Capture the constructor + the registered callback so a test can
     drive entry events synchronously. The instances list lets a test
     verify how many observers were registered. */
  const instances = [];
  const ctor = jest.fn(function FakeIO(callback, options) {
    const inst = {
      callback,
      options,
      observe: jest.fn(),
      disconnect: jest.fn(),
    };
    instances.push(inst);
    return inst;
  });
  return { ctor, instances };
}

function withFakeCSSSupports(returnValue) {
  global.CSS = { supports: jest.fn().mockReturnValue(returnValue) };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

afterEach(() => {
  global.CSS = ORIGINAL_CSS;
  global.IntersectionObserver = ORIGINAL_IO;
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('setupHeaderToggle — feature-gate bailouts (no observer registered)', () => {
  test('returns early when CSS.supports("animation-timeline: view()") is true', () => {
    withFakeCSSSupports(true);
    const { ctor } = fakeIntersectionObserver();
    global.IntersectionObserver = ctor;
    document.body.innerHTML = '<section class="hero"><h1>Title</h1></section>';

    setupHeaderToggle();

    expect(global.CSS.supports).toHaveBeenCalledWith('animation-timeline: view()');
    expect(ctor).not.toHaveBeenCalled();
    expect(document.body.className).toBe('');
  });

  test('proceeds when CSS is undefined (older engines)', () => {
    /* `typeof CSS !== 'undefined'` is false, so the guard short-circuits
       to the next gate. We confirm by reaching the IO check, which
       returns early because IO is also undefined. */
    delete global.CSS;
    delete global.IntersectionObserver;
    document.body.innerHTML = '<section class="hero"><h1>Title</h1></section>';

    expect(() => setupHeaderToggle()).not.toThrow();
    expect(document.body.className).toBe('');
  });

  test('proceeds when CSS.supports is missing (very old engines)', () => {
    /* Force CSS to exist but without a `.supports` method — the guard's
       second clause `&& CSS.supports` short-circuits to false. */
    global.CSS = {};
    const { ctor } = fakeIntersectionObserver();
    global.IntersectionObserver = ctor;
    document.body.innerHTML = '<section class="hero"><h1>Title</h1></section>';

    setupHeaderToggle();

    /* Did not bail at the CSS gate → reached the IO ctor. */
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  test('returns when IntersectionObserver is undefined', () => {
    withFakeCSSSupports(false);
    delete global.IntersectionObserver;
    document.body.innerHTML = '<section class="hero"><h1>Title</h1></section>';

    expect(() => setupHeaderToggle()).not.toThrow();
    expect(document.body.className).toBe('');
  });

  test('returns when .hero h1 is missing from the DOM', () => {
    withFakeCSSSupports(false);
    const { ctor } = fakeIntersectionObserver();
    global.IntersectionObserver = ctor;
    document.body.innerHTML = '<header></header><main></main>';

    setupHeaderToggle();

    expect(ctor).not.toHaveBeenCalled();
    expect(document.body.className).toBe('');
  });
});

describe('setupHeaderToggle — happy path (legacy browser, hero h1 present)', () => {
  test('registers a single IntersectionObserver on the hero h1', () => {
    withFakeCSSSupports(false);
    const { ctor, instances } = fakeIntersectionObserver();
    global.IntersectionObserver = ctor;
    document.body.innerHTML = '<section class="hero"><h1 id="hero">Title</h1></section>';

    setupHeaderToggle();

    expect(ctor).toHaveBeenCalledTimes(1);
    /* Pin the observer options — threshold 0 is what makes the toggle
       fire on any viewport edge crossing. A mutant changing it to
       1 would silently break the fallback on slow scrolls. */
    expect(ctor.mock.calls[0][1]).toEqual({ threshold: 0 });
    expect(instances).toHaveLength(1);
    expect(instances[0].observe).toHaveBeenCalledTimes(1);
    expect(instances[0].observe).toHaveBeenCalledWith(document.getElementById('hero'));
  });

  test('callback adds is-scrolled-past-hero when the h1 leaves the viewport', () => {
    withFakeCSSSupports(false);
    const { ctor, instances } = fakeIntersectionObserver();
    global.IntersectionObserver = ctor;
    document.body.innerHTML = '<section class="hero"><h1>Title</h1></section>';

    setupHeaderToggle();
    const cb = instances[0].callback;

    cb([{ isIntersecting: false }]);
    expect(document.body.classList.contains('is-scrolled-past-hero')).toBe(true);
  });

  test('callback removes is-scrolled-past-hero when the h1 re-enters the viewport', () => {
    withFakeCSSSupports(false);
    const { ctor, instances } = fakeIntersectionObserver();
    global.IntersectionObserver = ctor;
    document.body.innerHTML = '<section class="hero"><h1>Title</h1></section>';

    setupHeaderToggle();
    const cb = instances[0].callback;

    /* Simulate scroll: leave, then return to top. */
    cb([{ isIntersecting: false }]);
    expect(document.body.classList.contains('is-scrolled-past-hero')).toBe(true);
    cb([{ isIntersecting: true }]);
    expect(document.body.classList.contains('is-scrolled-past-hero')).toBe(false);
  });
});
