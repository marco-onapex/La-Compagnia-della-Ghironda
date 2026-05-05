// Mock the logger BEFORE importing modules that consume it, so the mocked
// devWarn is the one captured by vitals.js. jest.mock is hoisted to the top.
jest.mock('../../js/modules/logger.js', () => ({ devWarn: jest.fn() }));

import { devWarn } from '../../js/modules/logger.js';
import { measureWebVitals } from '../../js/modules/vitals.js';

describe('measureWebVitals()', () => {
  let observerCallbacks;

  beforeEach(() => {
    observerCallbacks = {};

    window.PerformanceObserver = Object.assign(
      jest.fn((callback) => ({
        observe: jest.fn(({ type }) => {
          observerCallbacks[type] = callback;
        }),
        disconnect: jest.fn(),
      })),
      {
        /* `vitals.js` gates each `observe()` on
           `PerformanceObserver.supportedEntryTypes.includes(type)`
           to skip the Chrome "Ignored unsupported entryTypes" console
           warning on engines that don't ship the type. The full mock
           supports every type we observe; individual tests below that
           need to simulate "type unsupported" override this list. */
        supportedEntryTypes: ['paint', 'largest-contentful-paint', 'layout-shift', 'event'],
      },
    );

    // jsdom may not implement performance.mark — define it directly
    window.performance.mark = jest.fn();
    delete window.__vitals;
    delete window.__vitalsEndpoint;
  });

  afterEach(() => {
    delete window.__vitals;
    delete window.__vitalsEndpoint;
    delete window.PerformanceObserver;
    delete window.performance.mark;
    jest.clearAllMocks();
  });

  test('returns early when PerformanceObserver is unavailable', () => {
    delete window.PerformanceObserver;
    expect(() => measureWebVitals()).not.toThrow();
    expect(window.__vitals).toBeUndefined();
  });

  test('exposes window.__vitals as an object', () => {
    measureWebVitals();
    expect(typeof window.__vitals).toBe('object');
  });

  test('registers observers for paint, lcp, layout-shift, and event (INP)', () => {
    measureWebVitals();
    expect(observerCallbacks).toHaveProperty('paint');
    expect(observerCallbacks).toHaveProperty('largest-contentful-paint');
    expect(observerCallbacks).toHaveProperty('layout-shift');
    expect(observerCallbacks).toHaveProperty('event');
  });

  test('records FCP from first-contentful-paint entry and marks performance', () => {
    measureWebVitals();
    observerCallbacks['paint']({
      getEntries: () => [{ name: 'first-contentful-paint', startTime: 1063.4 }],
    });
    expect(window.__vitals.FCP).toBe(1063);
    expect(window.performance.mark).toHaveBeenCalledWith('vitals:fcp');
  });

  test('ignores paint entries that are not first-contentful-paint', () => {
    measureWebVitals();
    observerCallbacks['paint']({
      getEntries: () => [{ name: 'first-paint', startTime: 900 }],
    });
    expect(window.__vitals.FCP).toBeUndefined();
  });

  test('records LCP using the last entry and marks performance', () => {
    measureWebVitals();
    observerCallbacks['largest-contentful-paint']({
      getEntries: () => [{ startTime: 1000 }, { startTime: 1663.7 }],
    });
    expect(window.__vitals.LCP).toBe(1664);
    expect(window.performance.mark).toHaveBeenCalledWith('vitals:lcp');
  });

  test('does not record LCP when entry list is empty', () => {
    measureWebVitals();
    observerCallbacks['largest-contentful-paint']({ getEntries: () => [] });
    expect(window.__vitals.LCP).toBeUndefined();
  });

  test('accumulates CLS from layout-shift entries without recent input', () => {
    measureWebVitals();
    observerCallbacks['layout-shift']({
      getEntries: () => [
        { value: 0.1, hadRecentInput: false },
        { value: 0.05, hadRecentInput: false },
      ],
    });
    expect(window.__vitals.CLS).toBe(0.15);
  });

  test('excludes layout shifts with hadRecentInput from CLS total', () => {
    measureWebVitals();
    observerCallbacks['layout-shift']({
      getEntries: () => [
        { value: 0.1, hadRecentInput: false },
        { value: 0.9, hadRecentInput: true },
      ],
    });
    expect(window.__vitals.CLS).toBe(0.1);
  });

  test('records INP as the worst event-timing duration observed', () => {
    measureWebVitals();
    observerCallbacks['event']({
      getEntries: () => [{ duration: 50 }, { duration: 120 }, { duration: 80 }],
    });
    expect(window.__vitals.INP).toBe(120);
  });

  test('INP is updated only when a slower interaction is observed', () => {
    measureWebVitals();
    observerCallbacks['event']({ getEntries: () => [{ duration: 200 }] });
    expect(window.__vitals.INP).toBe(200);
    /* A faster subsequent interaction MUST NOT lower the recorded worst. */
    observerCallbacks['event']({ getEntries: () => [{ duration: 60 }] });
    expect(window.__vitals.INP).toBe(200);
  });

  test('INP is NOT re-reported when duration equals the current worst (strict >, not >=)', () => {
    /* The condition is `dur > worstINP`, not `>=`. An equal duration must
       NOT call reportVital again — that would double-emit the same value
       and inflate the analytics signal. */
    measureWebVitals();
    /* Set up a sendBeacon spy on a same-origin endpoint so reportVital
       actually goes through. */
    window.__vitalsEndpoint = '/analytics';
    const sendBeaconSpy = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeaconSpy,
    });

    observerCallbacks['event']({ getEntries: () => [{ duration: 150 }] });
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);

    /* Same duration → must be a no-op, NOT another sendBeacon call. */
    observerCallbacks['event']({ getEntries: () => [{ duration: 150 }] });
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);

    Reflect.deleteProperty(navigator, 'sendBeacon');
  });

  test('INP reportVital uses the exact metric name "INP"', () => {
    /* Pin the literal so a string-literal mutation (`'INP' → ""`) is
       killed: an empty metric name would still satisfy a generic
       sendBeacon call but corrupt downstream analytics. */
    window.__vitalsEndpoint = '/analytics';
    const sendBeaconSpy = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeaconSpy,
    });
    const blobSpy = jest.fn((parts, opts) => ({ _parts: parts, type: opts?.type }));
    const OriginalBlob = global.Blob;
    global.Blob = blobSpy;

    measureWebVitals();
    observerCallbacks['event']({ getEntries: () => [{ duration: 99 }] });

    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(blobSpy.mock.calls[0][0][0]);
    expect(parsed.name).toBe('INP');
    expect(parsed.value).toBe(99);

    global.Blob = OriginalBlob;
    Reflect.deleteProperty(navigator, 'sendBeacon');
  });

  /* Helper: build a `window.PerformanceObserver` mock that throws on
     the Nth `new` invocation and otherwise registers the observer
     callback into the closed-over `observerCallbacks` map. The
     mocked constructor function is decorated with the same
     `supportedEntryTypes` array as the default beforeEach mock so
     `vitals.js`'s gate sees every type as supported and proceeds
     to call the constructor (where the throw happens). */
  function mockPerformanceObserverThrowingOn(targetCall, errMessage) {
    let callCount = 0;
    const mock = jest.fn((callback) => {
      callCount++;
      if (callCount === targetCall) {
        throw new Error(errMessage);
      }
      return {
        observe: jest.fn(({ type }) => {
          observerCallbacks[type] = callback;
        }),
        disconnect: jest.fn(),
      };
    });
    mock.supportedEntryTypes = ['paint', 'largest-contentful-paint', 'layout-shift', 'event'];
    return mock;
  }

  test('calls devWarn when event-timing observer constructor throws', () => {
    /* Older browsers (Firefox < 130) don't implement type:'event' for
       PerformanceObserver. The reporter MUST swallow the throw and
       forward to devWarn so the dev console flags the gap. A mutant
       that empties the catch block would silently leak the throw. */
    window.PerformanceObserver = mockPerformanceObserverThrowingOn(4, 'event observer unsupported');
    expect(() => measureWebVitals()).not.toThrow();
    expect(devWarn).toHaveBeenCalledWith(
      '[vitals] event-timing observer failed:',
      expect.any(Error),
    );
  });

  test('calls devWarn when paint observer constructor throws', () => {
    window.PerformanceObserver = mockPerformanceObserverThrowingOn(1, 'unsupported type');
    expect(() => measureWebVitals()).not.toThrow();
    expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('[vitals]'), expect.any(Error));
  });

  test('calls devWarn when LCP observer constructor throws', () => {
    window.PerformanceObserver = mockPerformanceObserverThrowingOn(2, 'lcp unsupported');
    expect(() => measureWebVitals()).not.toThrow();
    expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('[vitals]'), expect.any(Error));
  });

  test('calls devWarn when layout-shift observer constructor throws', () => {
    window.PerformanceObserver = mockPerformanceObserverThrowingOn(3, 'cls unsupported');
    expect(() => measureWebVitals()).not.toThrow();
    expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('[vitals]'), expect.any(Error));
  });

  test('continues registering remaining observers when one throws', () => {
    window.PerformanceObserver = mockPerformanceObserverThrowingOn(1, 'unsupported');
    measureWebVitals();
    // 2nd and 3rd observers (LCP + CLS) should still be registered
    expect(observerCallbacks).toHaveProperty('largest-contentful-paint');
    expect(observerCallbacks).toHaveProperty('layout-shift');
  });

  /* New: gate-by-supportedEntryTypes coverage. These tests verify
     that vitals.js skips the `new PerformanceObserver()` + `observe()`
     call entirely for types that the engine doesn't ship — preventing
     Chromium's "Ignored unsupported entryTypes" console warning. */
  test('skips paint observer when paint is NOT in supportedEntryTypes', () => {
    window.PerformanceObserver = Object.assign(
      jest.fn((callback) => ({
        observe: jest.fn(({ type }) => {
          observerCallbacks[type] = callback;
        }),
        disconnect: jest.fn(),
      })),
      { supportedEntryTypes: ['largest-contentful-paint', 'layout-shift', 'event'] },
    );
    measureWebVitals();
    expect(observerCallbacks).not.toHaveProperty('paint');
    expect(observerCallbacks).toHaveProperty('largest-contentful-paint');
  });

  test('skips layout-shift observer on engines without that entry type (Firefox/Safari ≤ 16)', () => {
    window.PerformanceObserver = Object.assign(
      jest.fn((callback) => ({
        observe: jest.fn(({ type }) => {
          observerCallbacks[type] = callback;
        }),
        disconnect: jest.fn(),
      })),
      { supportedEntryTypes: ['paint', 'largest-contentful-paint'] },
    );
    measureWebVitals();
    expect(observerCallbacks).not.toHaveProperty('layout-shift');
    expect(observerCallbacks).not.toHaveProperty('event');
    expect(observerCallbacks).toHaveProperty('paint');
    expect(observerCallbacks).toHaveProperty('largest-contentful-paint');
  });

  test('skips LCP observer when largest-contentful-paint is NOT in supportedEntryTypes (kills `if (true)` mutant)', () => {
    /* Pinned regression for the Stryker ConditionalExpression mutant
       on the LCP gate. Without this test, Stryker mutated
       `if (supported.has('largest-contentful-paint'))` to `if (true)`
       and survived because every other test had LCP in the supported
       list — the conditional was always truthy in tests, so the
       mutant produced identical behavior. Here we explicitly omit
       'largest-contentful-paint' from supportedEntryTypes and assert
       the observer is NOT registered. */
    window.PerformanceObserver = Object.assign(
      jest.fn((callback) => ({
        observe: jest.fn(({ type }) => {
          observerCallbacks[type] = callback;
        }),
        disconnect: jest.fn(),
      })),
      { supportedEntryTypes: ['paint', 'layout-shift', 'event'] },
    );
    measureWebVitals();
    expect(observerCallbacks).not.toHaveProperty('largest-contentful-paint');
    expect(observerCallbacks).toHaveProperty('paint');
    expect(observerCallbacks).toHaveProperty('layout-shift');
    expect(observerCallbacks).toHaveProperty('event');
  });

  test('skips event observer when event is NOT in supportedEntryTypes (older Safari)', () => {
    window.PerformanceObserver = Object.assign(
      jest.fn((callback) => ({
        observe: jest.fn(({ type }) => {
          observerCallbacks[type] = callback;
        }),
        disconnect: jest.fn(),
      })),
      { supportedEntryTypes: ['paint', 'largest-contentful-paint', 'layout-shift'] },
    );
    measureWebVitals();
    expect(observerCallbacks).not.toHaveProperty('event');
    expect(observerCallbacks).toHaveProperty('paint');
    expect(observerCallbacks).toHaveProperty('largest-contentful-paint');
    expect(observerCallbacks).toHaveProperty('layout-shift');
  });

  test('handles missing supportedEntryTypes (legacy browsers) by skipping every observer cleanly', () => {
    /* Some legacy implementations of PerformanceObserver don't expose
       `supportedEntryTypes` on the constructor. Treat missing as empty
       — no observers registered, no console warnings. */
    window.PerformanceObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn(),
    }));
    /* `supportedEntryTypes` intentionally NOT set on the mock. */
    expect(() => measureWebVitals()).not.toThrow();
    expect(observerCallbacks).toEqual({});
    /* Window.__vitals is still created (sentinel that the module ran)
       even though no observers fired. */
    expect(typeof window.__vitals).toBe('object');
  });

  // ─── Behavioural assertions (mutation-test gap closers) ───────────────────
  // The asserts below pin down literal options and string contracts that
  // mutation testing flagged: { buffered: true }, the FCP/LCP/CLS metric
  // names, and the sendBeacon JSON shape. Removing any of them lets a
  // surviving mutant slip through the suite.

  test('all four PerformanceObservers are configured with buffered:true', () => {
    const observeCalls = [];
    window.PerformanceObserver = Object.assign(
      jest.fn(() => ({
        observe: jest.fn((opts) => observeCalls.push(opts)),
        disconnect: jest.fn(),
      })),
      { supportedEntryTypes: ['paint', 'largest-contentful-paint', 'layout-shift', 'event'] },
    );
    measureWebVitals();
    expect(observeCalls).toEqual([
      { type: 'paint', buffered: true },
      { type: 'largest-contentful-paint', buffered: true },
      { type: 'layout-shift', buffered: true },
      { type: 'event', durationThreshold: 40, buffered: true },
    ]);
  });

  describe('reportVital — sendBeacon contract (when __vitalsEndpoint is set)', () => {
    let sendBeaconSpy, blobSpy;
    const OriginalBlob = global.Blob;

    beforeEach(() => {
      window.__vitalsEndpoint = '/analytics/collect';
      sendBeaconSpy = jest.fn().mockReturnValue(true);
      Object.defineProperty(navigator, 'sendBeacon', {
        configurable: true,
        value: sendBeaconSpy,
      });
      // jsdom's Blob has no .text(); intercept the constructor to read body+type.
      blobSpy = jest.fn((parts, opts) => ({ _parts: parts, type: opts?.type, _isBlobStub: true }));
      global.Blob = blobSpy;
    });

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'sendBeacon');
      global.Blob = OriginalBlob;
    });

    test('FCP entry triggers sendBeacon with name "FCP" and rounded value', () => {
      measureWebVitals();
      observerCallbacks['paint']({
        getEntries: () => [{ name: 'first-contentful-paint', startTime: 1063.4 }],
      });
      expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
      /* The endpoint is resolved against location.origin to enforce same-origin
         policy — sendBeacon receives the absolute URL, not the relative input. */
      expect(sendBeaconSpy.mock.calls[0][0]).toBe(
        new URL('/analytics/collect', location.origin).href,
      );
      expect(blobSpy).toHaveBeenCalledTimes(1);
      const [parts, opts] = blobSpy.mock.calls[0];
      expect(opts).toEqual({ type: 'application/json' });
      const parsed = JSON.parse(parts[0]);
      expect(parsed.name).toBe('FCP');
      expect(parsed.value).toBe(1063);
      expect(typeof parsed.url).toBe('string');
    });

    test('LCP entry triggers sendBeacon with name "LCP"', () => {
      measureWebVitals();
      observerCallbacks['largest-contentful-paint']({
        getEntries: () => [{ startTime: 1664 }],
      });
      const parsed = JSON.parse(blobSpy.mock.calls[0][0][0]);
      expect(parsed.name).toBe('LCP');
      expect(parsed.value).toBe(1664);
    });

    test('CLS aggregate triggers sendBeacon with name "CLS"', () => {
      measureWebVitals();
      observerCallbacks['layout-shift']({
        getEntries: () => [{ value: 0.123, hadRecentInput: false }],
      });
      const parsed = JSON.parse(blobSpy.mock.calls[0][0][0]);
      expect(parsed.name).toBe('CLS');
      expect(parsed.value).toBe(0.123);
    });

    test('sendBeacon failure is swallowed and forwarded to devWarn', () => {
      sendBeaconSpy.mockImplementation(() => {
        throw new Error('beacon blocked');
      });
      measureWebVitals();
      expect(() =>
        observerCallbacks['paint']({
          getEntries: () => [{ name: 'first-contentful-paint', startTime: 800 }],
        }),
      ).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith('[vitals] sendBeacon failed:', expect.any(Error));
    });

    test('cross-origin __vitalsEndpoint is refused (same-origin policy)', () => {
      /* A page-injected script setting `__vitalsEndpoint` to a third-party
         URL would otherwise exfiltrate vitals + the page URL. The reporter
         must refuse such endpoints and warn in dev mode. */
      window.__vitalsEndpoint = 'https://attacker.example/exfil';
      measureWebVitals();
      observerCallbacks['paint']({
        getEntries: () => [{ name: 'first-contentful-paint', startTime: 500 }],
      });
      expect(sendBeaconSpy).not.toHaveBeenCalled();
      expect(devWarn).toHaveBeenCalledWith(
        '[vitals] cross-origin endpoint refused:',
        'https://attacker.example',
      );
    });
  });

  test('reportVital is a no-op when __vitalsEndpoint is not a string', () => {
    const sendBeaconSpy = jest.fn();
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeaconSpy,
    });
    // __vitalsEndpoint is undefined (cleared in beforeEach) — sendBeacon must not fire
    measureWebVitals();
    observerCallbacks['paint']({
      getEntries: () => [{ name: 'first-contentful-paint', startTime: 900 }],
    });
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'sendBeacon');
  });

  test('devWarn for paint failure includes the "[vitals] paint observer" prefix', () => {
    window.PerformanceObserver = Object.assign(
      jest.fn(() => {
        throw new Error('boom');
      }),
      { supportedEntryTypes: ['paint', 'largest-contentful-paint', 'layout-shift', 'event'] },
    );
    measureWebVitals();
    expect(devWarn).toHaveBeenCalledWith('[vitals] paint observer failed:', expect.any(Error));
  });

  test('devWarn for LCP failure includes the "[vitals] LCP observer" prefix', () => {
    let n = 0;
    window.PerformanceObserver = Object.assign(
      jest.fn((cb) => {
        n++;
        if (n === 2) {
          throw new Error('boom');
        }
        return {
          observe: jest.fn(({ type }) => {
            observerCallbacks[type] = cb;
          }),
          disconnect: jest.fn(),
        };
      }),
      { supportedEntryTypes: ['paint', 'largest-contentful-paint', 'layout-shift', 'event'] },
    );
    measureWebVitals();
    expect(devWarn).toHaveBeenCalledWith('[vitals] LCP observer failed:', expect.any(Error));
  });

  test('devWarn for layout-shift failure includes the "[vitals] layout-shift observer" prefix', () => {
    let n = 0;
    window.PerformanceObserver = Object.assign(
      jest.fn((cb) => {
        n++;
        if (n === 3) {
          throw new Error('boom');
        }
        return {
          observe: jest.fn(({ type }) => {
            observerCallbacks[type] = cb;
          }),
          disconnect: jest.fn(),
        };
      }),
      { supportedEntryTypes: ['paint', 'largest-contentful-paint', 'layout-shift', 'event'] },
    );
    measureWebVitals();
    expect(devWarn).toHaveBeenCalledWith(
      '[vitals] layout-shift observer failed:',
      expect.any(Error),
    );
  });
});
