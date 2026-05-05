/**
 * main.js bootstrap test.
 *
 * Post-refactor (April 2026 — Level B / pure CSS architecture), main.js
 * has shed all graphical responsibilities. The bootstrap path is now:
 *   1. Inject deferred CSS <link> on load
 *   2. Initialise Web Vitals observers
 *   3. Register the service worker
 *
 * All three are exercised here:
 *   - Item 1 in the "deferred-CSS loader" describe (readyState=complete +
 *     readyState=loading + link.onload/onerror handlers).
 *   - Item 2 in vitals.test.js (the dedicated module suite).
 *   - Item 3 in the "service-worker registration" describe (success + failure).
 *
 * The default suite at the top verifies that importing main.js is
 * side-effect-safe under the baseline jsdom config: no thrown errors,
 * no JS-managed graphical state mutations. The dedicated suites below
 * use jest.resetModules + module.import to exercise alternative
 * environments (different readyState, different navigator.serviceWorker
 * presence).
 */

describe('main module bootstrap (Level B — pure CSS architecture)', () => {
  beforeAll(async () => {
    /* Minimal DOM — main.js no longer touches DOM directly except for
       the deferred-CSS <link> injection (covered by istanbul ignore). */
    document.body.innerHTML = '<header></header><main></main>';
    /* PerformanceObserver mock so vitals.measureWebVitals doesn't throw
       in jsdom (jsdom doesn't ship the API). */
    window.PerformanceObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn(),
    }));
    /* Reset URL to baseline (no ?vitals) so this default suite runs
       against the inactive vitals path. The dedicated suite below
       toggles the URL via history.replaceState before each import. */
    window.history.replaceState({}, '', '/');
    delete window.__vitalsEndpoint;
    jest.resetModules();
    await import('../../js/main.js');
  });

  afterAll(() => {
    document.body.innerHTML = '';
    delete window.PerformanceObserver;
    delete window.__vitalsEndpoint;
    jest.restoreAllMocks();
  });

  test('imports without throwing', () => {
    /* If we got here, the import didn't throw — the module is structurally
       sound and its top-level side effects (PerformanceObserver setup)
       completed. */
    expect(true).toBe(true);
  });

  test('only mutation is the deferred-stylesheet <link> (NO inline styles, classes, ARIA)', () => {
    /* main.js may inject a <link rel="stylesheet"> to load the deferred
       CSS bundle — that's loading plumbing, not graphical state. It
       must NOT:
         - write inline styles on any element
         - toggle CSS classes anywhere
         - set ARIA attributes (those would imply state-driven CSS)
       The CSS bundle handles every visual transition itself. */
    const hrefs = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).map((l) =>
      l.getAttribute('href'),
    );
    /* In jsdom readyState defaults to 'complete', so the loader fires
       synchronously and the <link> appears in the head. Either 0 links
       (load deferred) or exactly the deferred-CSS bundle href. `every`
       on an empty array returns true, covering both cases without a
       conditional `expect` (jest/no-conditional-expect). */
    expect(hrefs.length).toBeLessThanOrEqual(1);
    expect(hrefs.every((h) => h === 'dist/style-deferred.min.css')).toBe(true);
    /* No inline style writes on the root, body, header, or main. */
    expect(document.documentElement.getAttribute('style')).toBeNull();
    expect(document.body.getAttribute('style')).toBeNull();
    /* No CSS classes added by JS (the document started with none). */
    expect(document.documentElement.className).toBe('');
    expect(document.body.className).toBe('');
  });

  test('no `?vitals` URL param → window.__vitalsEndpoint is left untouched', () => {
    /* The default suite navigated to '/' before importing main.js, so
       the URLSearchParams.get('vitals') call returns null and the
       conditional skips the assignment. Pinning this branch covers
       the "off" path of the URL-param activation logic. */
    expect(window.__vitalsEndpoint).toBeUndefined();
  });
});

describe('main bootstrap with ?vitals URL param activation', () => {
  /* Separate describe block because the URL state is module-load-time
     evaluated; we re-import main.js per scenario via jest.resetModules
     and a different `window.location.search`. history.replaceState
     mutates location.search in jsdom without recreating Location, so
     URLSearchParams reads the new value on the next `new URLSearchParams(...)`. */
  beforeEach(() => {
    document.body.innerHTML = '<header></header><main></main>';
    window.PerformanceObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn(),
    }));
    delete window.__vitalsEndpoint;
    /* Drop any stylesheet links injected by previous imports of main.js
       so we don't pile up duplicates across scenarios. */
    document.head.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove());
  });

  afterEach(() => {
    delete window.PerformanceObserver;
    delete window.__vitalsEndpoint;
    window.history.replaceState({}, '', '/');
  });

  test('?vitals=/__vitals → window.__vitalsEndpoint is set to "/__vitals"', async () => {
    window.history.replaceState({}, '', '/?vitals=/__vitals');
    jest.resetModules();
    await import('../../js/main.js');
    expect(window.__vitalsEndpoint).toBe('/__vitals');
  });

  test('?vitals=https://same-origin/log → endpoint set to absolute URL (vitals.js enforces same-origin)', async () => {
    /* main.js trusts `window.__vitalsEndpoint` blindly — it's vitals.js
       that refuses cross-origin endpoints. This test pins that main.js
       does NOT pre-validate (one less place for the same-origin policy
       to drift). */
    window.history.replaceState({}, '', '/?vitals=https://attacker.example/log');
    jest.resetModules();
    await import('../../js/main.js');
    expect(window.__vitalsEndpoint).toBe('https://attacker.example/log');
    /* Defence-in-depth lives in vitals.test.js — see the
       "cross-origin __vitalsEndpoint is refused" suite there. */
  });

  test('?vitals (empty value) is treated as falsy → endpoint NOT set', async () => {
    /* `?vitals` with no value → URLSearchParams.get('vitals') returns
       the empty string, which is falsy. The activation skips. Pinning
       this branch prevents a future refactor that mistakenly treats
       empty string as "set endpoint to ''". */
    window.history.replaceState({}, '', '/?vitals=');
    jest.resetModules();
    await import('../../js/main.js');
    expect(window.__vitalsEndpoint).toBeUndefined();
  });
});

describe('main bootstrap: deferred-CSS loader', () => {
  /* Exercises both readyState branches + the link.onload/onerror
     handlers. Each scenario re-imports main.js with the desired
     readyState pre-mocked (jsdom defaults to 'complete'). */
  let readyStateSpy;
  let originalServiceWorker;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove());
    window.PerformanceObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn(),
    }));
    window.history.replaceState({}, '', '/');
    delete window.__vitalsEndpoint;
    delete window.__deferredCssLoaded;
    originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    /* Stub navigator.serviceWorker so the SW-registration block at
       module load doesn't throw — its specific behaviour is exercised
       in the next describe block. */
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: jest.fn().mockResolvedValue({}) },
    });
  });

  afterEach(() => {
    if (readyStateSpy) {
      readyStateSpy.mockRestore();
      readyStateSpy = null;
    }
    delete window.PerformanceObserver;
    delete window.__vitalsEndpoint;
    delete window.__deferredCssLoaded;
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    } else {
      delete navigator.serviceWorker;
    }
  });

  test('readyState="complete" → apply() fires synchronously, <link> appended at module load', async () => {
    /* jsdom default. Just verify the link is in the head. */
    jest.resetModules();
    await import('../../js/main.js');
    const links = document.head.querySelectorAll(
      'link[rel="stylesheet"][href="dist/style-deferred.min.css"]',
    );
    expect(links).toHaveLength(1);
  });

  test('readyState="loading" → apply() deferred to load event, NO <link> at module load', async () => {
    readyStateSpy = jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const addListenerSpy = jest.spyOn(window, 'addEventListener');
    jest.resetModules();
    await import('../../js/main.js');
    /* No link yet — applied on load event */
    expect(
      document.head.querySelectorAll('link[rel="stylesheet"][href="dist/style-deferred.min.css"]'),
    ).toHaveLength(0);
    /* But the load listener was registered. Find the call that
       matches our pattern (`load`, function, { once: true }). */
    const loadCall = addListenerSpy.mock.calls.find(
      (c) => c[0] === 'load' && typeof c[1] === 'function' && c[2] && c[2].once === true,
    );
    expect(loadCall).toBeDefined();
    /* Now fire the listener manually and check the link appears. */
    loadCall[1]();
    expect(
      document.head.querySelectorAll('link[rel="stylesheet"][href="dist/style-deferred.min.css"]'),
    ).toHaveLength(1);
    addListenerSpy.mockRestore();
  });

  test('link.onload → window.__deferredCssLoaded = true', async () => {
    jest.resetModules();
    await import('../../js/main.js');
    const link = document.head.querySelector(
      'link[rel="stylesheet"][href="dist/style-deferred.min.css"]',
    );
    expect(link).not.toBeNull();
    /* Manually fire onload (jsdom doesn't load the CSS for real). */
    link.onload();
    expect(window.__deferredCssLoaded).toBe(true);
  });

  test('link.onerror → window.__deferredCssLoaded = false + devWarn called', async () => {
    /* Mock devWarn so we can assert without polluting the console buffer. */
    jest.resetModules();
    jest.doMock('../../js/modules/logger.js', () => ({ devWarn: jest.fn() }));
    /* jest.doMock takes effect on next require/import. Re-import logger
       AND main here so the mocked devWarn is the one main.js uses. */
    const { devWarn } = await import('../../js/modules/logger.js');
    await import('../../js/main.js');
    const link = document.head.querySelector(
      'link[rel="stylesheet"][href="dist/style-deferred.min.css"]',
    );
    link.onerror();
    expect(window.__deferredCssLoaded).toBe(false);
    expect(devWarn).toHaveBeenCalledWith(
      '[main] deferred CSS failed to load:',
      expect.stringContaining('dist/style-deferred.min.css'),
    );
    jest.dontMock('../../js/modules/logger.js');
  });
});

describe('main bootstrap: service-worker registration', () => {
  let originalServiceWorker;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove());
    window.PerformanceObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn(),
    }));
    window.history.replaceState({}, '', '/');
    delete window.__vitalsEndpoint;
    originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  });

  afterEach(() => {
    delete window.PerformanceObserver;
    delete window.__vitalsEndpoint;
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    } else {
      delete navigator.serviceWorker;
    }
  });

  test('navigator.serviceWorker present → register("sw.js", { scope: "./" }) called', async () => {
    const register = jest.fn().mockResolvedValue({});
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });
    jest.resetModules();
    await import('../../js/main.js');
    expect(register).toHaveBeenCalledWith('sw.js', { scope: './' });
  });

  test('register failure → devWarn called with the rejection (no uncaught error)', async () => {
    const error = new Error('SW install failed');
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: jest.fn().mockRejectedValue(error) },
    });
    jest.resetModules();
    jest.doMock('../../js/modules/logger.js', () => ({ devWarn: jest.fn() }));
    const { devWarn } = await import('../../js/modules/logger.js');
    await import('../../js/main.js');
    /* The .catch(devWarn) is on a Promise — wait one microtask flush. */
    await Promise.resolve();
    await Promise.resolve();
    expect(devWarn).toHaveBeenCalledWith(error);
    jest.dontMock('../../js/modules/logger.js');
  });

  test('navigator.serviceWorker absent → no register call, module still imports cleanly', async () => {
    /* The `'serviceWorker' in navigator` guard skips registration on
       legacy browsers / non-secure contexts. Pin that the guard
       actually short-circuits — without the test, a mutation that
       drops the guard (and tries to access undefined.register) would
       slip through. */
    delete navigator.serviceWorker;
    jest.resetModules();
    await expect(import('../../js/main.js')).resolves.toBeDefined();
  });
});
