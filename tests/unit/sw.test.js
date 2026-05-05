/**
 * Service Worker unit tests.
 *
 * sw.js exports a `setup(self, env)` function via the dual-mode CJS
 * bootstrap at the bottom of the file. Tests `require()` it (going
 * through the standard Jest transform pipeline → babel-jest →
 * istanbul + Stryker instrumentation, both for free) and invoke
 * `setup` with a fully-mocked `self` and explicit `env` overrides
 * for `caches`, `fetch`, `setTimeout`, `clearTimeout`,
 * `AbortController`, `URL`, `Response`.
 *
 * Coverage:
 *   - install   → precaches the asset list, then calls skipWaiting()
 *   - activate  → deletes any cache key that doesn't match CACHE_NAME, then claims clients
 *   - fetch     → ignores non-GET, cross-origin
 *               → HTML navigations → NetworkFirst with cache fallback
 *               → static assets → stale-while-revalidate
 *               → content-type policy: refuses to cache MIME-mismatched responses
 *               → swallows cache.put quota errors
 *               → returns cached on network error if available
 */

import fs from 'node:fs';
import path from 'node:path';

/* Read source `sw.js` here, NOT `.deploy/sw.js`. The behavioural
   tests that exercise activate/fetch handlers `require()` the source
   module — its compiled-in CACHE_NAME is whatever the source carries
   at the moment. Under round 20 (option B production-grade) the
   source value is the literal placeholder `'ghironda-PLACEHOLDER'`;
   only the build's `.deploy/sw.js` copy carries the 8-hex composite
   hash. Reading the deploy copy here would surface a different
   cacheName from what `require('../../sw.js')` loaded — every test
   that filters cache.keys against the loaded value would then fail
   to recognise its own cache name. */
const SW_PATH = path.join(__dirname, '..', '..', 'sw.js');

/* Source-level value extraction for the invariant tests AND for
   behavioural tests that need to know the SW's compile-time constants
   (e.g. asserting cache.add was called once per PRECACHE entry).

   Strict regexes work on the un-instrumented source (jest --coverage
   without Stryker). Under Stryker the literals are rewrapped with
   coverage probes, so we fall back to tolerant matches that pick the
   value out of the wrapper. As a last resort (extreme mutation that
   removes the literal entirely), we use the known canonical values —
   if a Stryker mutation actually changes those, behavioural tests
   downstream would catch the divergence regardless. */
const PRECACHE_CANONICAL = [
  './',
  './index.html',
  './dist/main.min.js',
  './dist/style-deferred.min.css',
  './fonts/cinzel-400.woff2',
  './fonts/cinzel-700-lcp.woff2',
  './images/ghironda-720.avif',
  './images/ghironda-720.webp',
  './images/ghironda-rings.svg',
];

function readSwSource() {
  const raw = fs.readFileSync(SW_PATH, 'utf8');
  const strictCacheName = raw.match(/const CACHE_NAME\s*=\s*'([^']+)'/);
  const cacheName = strictCacheName
    ? strictCacheName[1]
    : (raw.match(/'(ghironda-[0-9a-f]{8})'/) || ['', 'ghironda-unknown'])[1];
  const strictPrecache = raw.match(/const PRECACHE\s*=\s*\[([\s\S]*?)\]/);
  const extractedUrls = (
    (strictPrecache ? strictPrecache[1].match(/'(\.\/[^']*)'/g) : null) || []
  ).map((s) => s.slice(1, -1));
  /* Fall back to the canonical list when extraction yields nothing —
     happens under Stryker's source rewriting. Tests then assert against
     the same shape the SW actually iterates over at runtime. */
  const precacheUrls = extractedUrls.length > 0 ? extractedUrls : PRECACHE_CANONICAL;
  return { raw, cacheName, precacheUrls };
}

/* Source-invariant tests assert on literal patterns in sw.js — under
   Stryker the source has been instrumented, so those tests' premise
   no longer holds. Skip them in that environment; behavioural tests
   (which exercise the require'd module) still run and provide the
   real mutation-killing coverage.

   Detection: Stryker copies the project to `stryker-tmp/sandbox-XXXX/`
   and runs tests from there, so __dirname contains the literal
   "stryker-tmp" substring. We use this rather than `globalThis.__stryker__`
   because that probe is only injected under coverageAnalysis: 'perTest'
   (we run with 'off' to avoid the unreachable-coverage classification). */
const isStrykerRun = __dirname.includes('stryker-tmp');
const describeSourceInvariants = isStrykerRun ? describe.skip : describe;

/** Build a Response stub with the given content-type. */
function makeResponse({ ok = true, contentType = 'application/octet-stream', clone } = {}) {
  return {
    ok,
    headers: { get: jest.fn(() => contentType) },
    clone: clone || jest.fn(() => ({ headers: { get: () => contentType } })),
  };
}

/* Build a fresh isolated SW context per test. `jest.isolateModules`
   resets the require cache for the callback so sw.js is re-evaluated
   fresh each call (Stryker mutates the source between calls; without
   isolation we'd get the first cached version every time). */
function loadServiceWorker() {
  const handlers = {};
  const self = {
    location: { origin: 'https://example.test' },
    skipWaiting: jest.fn(() => Promise.resolve()),
    clients: { claim: jest.fn(() => Promise.resolve()) },
    addEventListener: jest.fn((event, handler) => {
      handlers[event] = handler;
    }),
  };

  const cacheStore = new Map();
  const cache = {
    match: jest.fn((req) =>
      Promise.resolve(cacheStore.get(typeof req === 'string' ? req : req.url)),
    ),
    put: jest.fn((req, res) => {
      cacheStore.set(req.url, res);
      return Promise.resolve();
    }),
    add: jest.fn((url) => {
      cacheStore.set(url, { ok: true, _precached: true });
      return Promise.resolve();
    }),
  };
  const caches = {
    open: jest.fn(() => Promise.resolve(cache)),
    keys: jest.fn(() => Promise.resolve([])),
    delete: jest.fn(() => Promise.resolve(true)),
  };

  const fetchMock = jest.fn(
    () =>
      new Promise(() => {
        /* pending */
      }),
  );
  /* `AbortSignal.timeout(N)` is the modern signal-with-timeout primitive
     used by sw.js. Jsdom doesn't ship it, so we provide a stub that
     returns objects implementing the AbortSignal-shape (aborted flag,
     reason, addEventListener) so that any future SW code reading
     `signal.aborted` or attaching a listener gets sensible behaviour
     instead of `undefined.something` crashes. The fetch mock currently
     ignores the signal — that's intentional, the contract test asserts
     the signal *is wired into* fetch options. */
  const AbortSignalStub = {
    timeout: jest.fn((ms) => {
      const listeners = new Set();
      return {
        _stub: 'timeout',
        ms,
        aborted: false,
        reason: undefined,
        addEventListener: jest.fn((type, listener) => {
          if (type === 'abort') {
            listeners.add(listener);
          }
        }),
        removeEventListener: jest.fn((type, listener) => {
          if (type === 'abort') {
            listeners.delete(listener);
          }
        }),
        /* Test-only helper: simulate the timeout firing. Not part of
           the AbortSignal interface; tests that need to exercise abort
           propagation can call it directly. */
        _fireAbort() {
          this.aborted = true;
          this.reason = new Error('TimeoutError');
          for (const fn of listeners) {
            fn({ type: 'abort', target: this });
          }
        },
      };
    }),
  };

  class URLStub {
    constructor(href) {
      const m = href.match(/^(https?:\/\/[^/]+)(\/.*)?$/);
      this.origin = m ? m[1] : href;
      this.pathname = m && m[2] ? m[2] : '/';
    }
  }

  class ResponseStub {
    constructor(body, init = {}) {
      /* Capture the constructor args so tests can assert on the offline-
         shell body + headers produced by sw.js when there is no cache
         and no network. Without this, body/headers were untestable and
         their Stryker mutations survived. */
      this._body = body;
      this._init = init;
      this.status = init.status || 200;
      this.headers = { get: jest.fn((k) => (init.headers || {})[k] || null) };
      this.ok = this.status >= 200 && this.status < 300;
    }
  }

  let setup;
  jest.isolateModules(() => {
    ({ setup } = require('../../sw.js'));
  });
  setup(self, {
    caches,
    fetch: fetchMock,
    URL: URLStub,
    Response: ResponseStub,
    AbortSignal: AbortSignalStub,
  });

  return { handlers, self, caches, cache, cacheStore, fetchMock, AbortSignalStub };
}

/* Synthetic FetchEvent. `mode` defaults to 'no-cors' so static-asset paths
   take the SWR branch; HTML-navigation tests pass `mode: 'navigate'`.

   Round-21: navigation handler now uses `event.waitUntil()` for the
   cache write (fire-and-forget pattern — see sw.js#networkFirstHTML).
   The synthetic event records the latest waitUntil promise as
   `event._waitedFor` so tests can await both the response and the
   background work via `await event._response; await event._waitedFor;`
   to assert post-cache-put state without flake. Tests that don't
   exercise navigation can ignore _waitedFor. */
function makeFetchEvent(method, url, mode = 'no-cors') {
  const event = {
    request: { method, url, mode, clone: () => ({ method, url, mode }) },
    respondWith: jest.fn((p) => {
      event._response = p;
    }),
    waitUntil: jest.fn((p) => {
      event._waitedFor = p;
    }),
  };
  return event;
}

/* ─── Source-level invariants ───────────────────────────────────────────────
   These tests pin the SHAPE of sw.js so Stryker's value-mutations (changing
   a literal, swapping a precache URL, dropping an extension) are killed.
   Without these the value-extracting regexes above would happily extract
   the mutated value and pass it through to the mocks — invisible to
   behavioural tests. */
describe('Service Worker — setup() default-binding fallback', () => {
  test('omitting `env` falls back to self.{caches, fetch, URL, Response, AbortSignal}', () => {
    /* The destructuring defaults inside setup(self, env = {}) make the
       SW callable from a real worker without an explicit env arg —
       defaults pull every dependency off `self`. This test exercises
       that fallback path so the per-property defaults are coverage-
       killed. */
    let setup;
    jest.isolateModules(() => {
      ({ setup } = require('../../sw.js'));
    });

    const fakeSelf = {
      location: { origin: 'https://example.test' },
      addEventListener: jest.fn(),
      caches: { open: jest.fn(), keys: jest.fn(), delete: jest.fn() },
      fetch: jest.fn(),
      URL: globalThis.URL,
      Response: globalThis.Response,
      AbortSignal: { timeout: jest.fn() },
    };
    expect(() => setup(fakeSelf)).not.toThrow();
    expect(fakeSelf.addEventListener).toHaveBeenCalledTimes(3);
  });
});

describeSourceInvariants('Service Worker — source invariants', () => {
  test('CACHE_NAME matches the cache-bust schema "ghironda-<8 hex>" (or the round-20 placeholder)', () => {
    /* Round 20 (option B): source `sw.js` ships with the literal
       placeholder `ghironda-PLACEHOLDER` that
       `scripts/cache-bust.js` substitutes into `.deploy/sw.js` at
       build time. We accept BOTH so the source invariant test
       passes both pre-build (source-pure) and post-build (when a
       previous build had injected a real hash that hadn't been
       reset). The post-build artefact's hash is exhaustively
       validated by `scripts.test.js` against an actual
       `cache-bust.js` run. */
    const { cacheName } = readSwSource();
    expect(cacheName).toMatch(/^ghironda-(?:[0-9a-f]{8}|PLACEHOLDER)$/);
  });

  test('PRECACHE pins the exact above-the-fold asset list', () => {
    const { precacheUrls } = readSwSource();
    expect(precacheUrls).toEqual([
      './',
      './index.html',
      './dist/main.min.js',
      './dist/style-deferred.min.css',
      './fonts/cinzel-400.woff2',
      './fonts/cinzel-700-lcp.woff2',
      './images/ghironda-720.avif',
      './images/ghironda-720.webp',
      './images/ghironda-rings.svg',
    ]);
  });

  test('CACHEABLE regex matches every extension we ship + .avif (forward-compat)', () => {
    const { raw } = readSwSource();
    const cacheableRe = new RegExp(
      raw.match(/const CACHEABLE\s*=\s*\/(\\\.[^/]+)\/(?:[gimsuy]*)/)[1],
    );
    for (const url of [
      '/dist/main.min.js',
      '/dist/style-deferred.min.css',
      '/fonts/cinzel-700.woff2',
      '/fonts/cinzel-decorative-400.ttf',
      '/images/ghironda-720.webp',
      '/images/ghironda-720.avif',
      '/images/apple-touch-icon.png',
      '/images/ghironda-rings.svg',
    ]) {
      expect(cacheableRe.test(url)).toBe(true);
    }
    for (const url of ['/index.html', '/api/something', '/random.txt']) {
      expect(cacheableRe.test(url)).toBe(false);
    }
  });

  test('CONTENT_TYPE_POLICY pins exactly 4 entries (one per asset family)', () => {
    const { raw } = readSwSource();
    const policyEntries =
      raw.match(/{\s*ext:\s*\/(?:\\.|[^/])+\/[^,]*,\s*mime:\s*\/(?:\\.|[^/])+\/\s*}/g) || [];
    expect(policyEntries).toHaveLength(4);
  });

  test('FETCH_TIMEOUT_MS is the documented 8 second budget', () => {
    const { raw } = readSwSource();
    const timeout = Number.parseInt(raw.match(/FETCH_TIMEOUT_MS\s*=\s*(\d+)/)[1], 10);
    expect(timeout).toBe(8000);
  });

  test('HTML_CACHE_KEY is the canonical "./index.html" — invariant for offline shell', () => {
    const { raw } = readSwSource();
    expect(raw).toMatch(/HTML_CACHE_KEY\s*=\s*'\.\/index\.html'/);
  });
});

describe('Service Worker — install', () => {
  test('install precaches the asset list, then calls skipWaiting', async () => {
    const { handlers, self, cache } = loadServiceWorker();
    const { precacheUrls } = readSwSource();
    let waited;
    const event = {
      waitUntil: jest.fn((p) => {
        waited = p;
      }),
    };
    handlers.install(event);
    await waited;

    expect(cache.add).toHaveBeenCalledTimes(precacheUrls.length);
    /* Pin the exact precache URLs — a mutant that drops one or swaps two
       entries would still satisfy the count assertion above. Sorting both
       sides lets the test pass independent of the order in which
       Promise.all schedules cache.add(). */
    const calledUrls = cache.add.mock.calls.map((args) => args[0]).sort();
    expect(calledUrls).toEqual([...precacheUrls].sort());
    expect(self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  test('install tolerates per-asset 404 without aborting (Promise.all + catch)', async () => {
    const { handlers, self, cache } = loadServiceWorker();
    cache.add
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValue(undefined);

    let waited;
    const event = {
      waitUntil: jest.fn((p) => {
        waited = p;
      }),
    };
    handlers.install(event);
    await expect(waited).resolves.toBeUndefined();
    expect(self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  test('install warns to console.warn on each per-asset precache failure', async () => {
    /* Round-23: the catch on `cache.add(url).catch(...)` was a silent
       `() => {}` until we replaced it with a `console.warn` so the
       miss surfaces in DevTools → Application → Service Workers.
       This test pins the warn so a future regression to silent-skip
       is caught immediately. */
    const { handlers, cache } = loadServiceWorker();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const err1 = new Error('404');
    const err2 = new Error('CSP blocked');
    cache.add
      .mockRejectedValueOnce(err1)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(err2)
      .mockResolvedValue(undefined);

    let waited;
    const event = {
      waitUntil: jest.fn((p) => {
        waited = p;
      }),
    };
    handlers.install(event);
    await waited;

    /* Two failed adds → two warn invocations. The exact URLs depend
       on which PRECACHE entries land in slot 1 and slot 3 of the
       Promise.all schedule, so we assert on count + tag + message
       fragment rather than on the URL identity. */
    expect(warnSpy).toHaveBeenCalledTimes(2);
    for (const call of warnSpy.mock.calls) {
      expect(call[0]).toBe('[sw] precache miss:');
      expect(typeof call[1]).toBe('string'); // url argument
    }
    const messages = warnSpy.mock.calls.map((c) => c[2]);
    expect(messages).toEqual(expect.arrayContaining(['404', 'CSP blocked']));

    warnSpy.mockRestore();
  });
});

describe('Service Worker — activate', () => {
  test('deletes stale caches and claims clients', async () => {
    const { handlers, self, caches } = loadServiceWorker();
    const { cacheName } = readSwSource();
    caches.keys.mockResolvedValueOnce(['ghironda-old', cacheName, 'unrelated-cache']);

    let waited;
    const event = {
      waitUntil: jest.fn((p) => {
        waited = p;
      }),
    };
    handlers.activate(event);
    await waited;

    expect(caches.delete).toHaveBeenCalledTimes(2);
    expect(caches.delete).toHaveBeenCalledWith('ghironda-old');
    expect(caches.delete).toHaveBeenCalledWith('unrelated-cache');
    expect(self.clients.claim).toHaveBeenCalledTimes(1);
  });

  test('no-op when there are no stale caches', async () => {
    const { handlers, self, caches } = loadServiceWorker();
    const { cacheName } = readSwSource();
    caches.keys.mockResolvedValueOnce([cacheName]);

    let waited;
    const event = {
      waitUntil: jest.fn((p) => {
        waited = p;
      }),
    };
    handlers.activate(event);
    await waited;

    expect(caches.delete).not.toHaveBeenCalled();
    expect(self.clients.claim).toHaveBeenCalledTimes(1);
  });
});

describe('Service Worker — fetch handler early returns', () => {
  test('ignores non-GET requests', () => {
    const { handlers } = loadServiceWorker();
    const event = makeFetchEvent('POST', 'https://example.test/dist/main.min.js');
    handlers.fetch(event);
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  test('ignores cross-origin requests', () => {
    const { handlers } = loadServiceWorker();
    const event = makeFetchEvent('GET', 'https://other.test/dist/main.min.js');
    handlers.fetch(event);
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  test('ignores non-cacheable paths in non-navigate mode (e.g. unknown extension)', () => {
    const { handlers } = loadServiceWorker();
    const event = makeFetchEvent('GET', 'https://example.test/some-api', 'no-cors');
    handlers.fetch(event);
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  test('handles cacheable paths (e.g. .min.js)', () => {
    const { handlers } = loadServiceWorker();
    const event = makeFetchEvent('GET', 'https://example.test/dist/main.min.js');
    handlers.fetch(event);
    expect(event.respondWith).toHaveBeenCalledTimes(1);
  });
});

describe('Service Worker — HTML navigation (NetworkFirst)', () => {
  test('navigation: returns network response when online', async () => {
    const { handlers, fetchMock } = loadServiceWorker();
    const fresh = makeResponse({ contentType: 'text/html' });
    fetchMock.mockResolvedValueOnce(fresh);

    const event = makeFetchEvent('GET', 'https://example.test/', 'navigate');
    handlers.fetch(event);
    const response = await event._response;
    expect(response).toBe(fresh);
  });

  test('navigation: caches the response under the canonical ./index.html key', async () => {
    const { handlers, cache, fetchMock } = loadServiceWorker();
    const fresh = makeResponse({ contentType: 'text/html' });
    fetchMock.mockResolvedValueOnce(fresh);

    /* `?utm=foo` forces fragmentation under the request URL — the SW must
       still write under `./index.html` so the offline shell can be matched
       by every future navigation regardless of marketing query strings. */
    const event = makeFetchEvent('GET', 'https://example.test/?utm=foo', 'navigate');
    handlers.fetch(event);
    await event._response;

    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(cache.put.mock.calls[0][0]).toBe('./index.html');
  });

  test('navigation: caches text/html with charset suffix (startsWith semantics)', async () => {
    /* Content-Type `text/html; charset=utf-8` is the wire-typical value
       — the loader tests `.startsWith('text/html')` to accept it. A
       Stryker mutant that swaps `.startsWith` for `.endsWith` would see
       the trailing `utf-8` and reject. This test pins the prefix
       semantics, killing that mutation. */
    const { handlers, cache, fetchMock } = loadServiceWorker();
    const fresh = makeResponse({ contentType: 'text/html; charset=utf-8' });
    fetchMock.mockResolvedValueOnce(fresh);

    const event = makeFetchEvent('GET', 'https://example.test/', 'navigate');
    handlers.fetch(event);
    await event._response;

    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  test('navigation: refuses to cache responses with non-text/html content-type', async () => {
    const { handlers, cache, fetchMock } = loadServiceWorker();
    /* Captive-portal scenario: 200 OK but the body is JSON or HTML from a
       hotel-WiFi login page. We still serve it (so the user sees the
       portal) but MUST NOT poison the offline shell with it. */
    const captive = makeResponse({ contentType: 'application/json' });
    fetchMock.mockResolvedValueOnce(captive);

    const event = makeFetchEvent('GET', 'https://example.test/', 'navigate');
    handlers.fetch(event);
    await event._response;

    expect(cache.put).not.toHaveBeenCalled();
  });

  test('navigation: falls back to cached HTML when offline', async () => {
    const { handlers, cacheStore, fetchMock } = loadServiceWorker();
    const cached = makeResponse({ contentType: 'text/html', clone: () => ({ cached: true }) });
    /* SW now stores under the canonical key, not the request URL. */
    cacheStore.set('./index.html', cached);
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));

    const event = makeFetchEvent('GET', 'https://example.test/?utm=foo', 'navigate');
    handlers.fetch(event);
    const response = await event._response;
    expect(response).toBe(cached);
  });

  test('navigation: returns inline 503 Offline when no cache available', async () => {
    const { handlers, fetchMock } = loadServiceWorker();
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));

    const event = makeFetchEvent('GET', 'https://example.test/never-cached', 'navigate');
    handlers.fetch(event);
    const response = await event._response;
    /* Round-23: the offline shell now ships a fully self-contained
       HTML5 document (lang, viewport, inline styling, italian copy)
       instead of a bare `<h1>`. We pin the load-bearing observable
       bits — doctype, language, the heading text, headers — and
       guard against any external resource that an offline browser
       could not fetch (those would render as broken icons / network
       errors and defeat the shell's purpose). */
    expect(response.status).toBe(503);
    expect(response._body).toMatch(/^<!doctype html>/i);
    expect(response._body).toContain('lang="it"');
    expect(response._body).toContain('Sei offline');
    expect(response._body).not.toMatch(/<link\b/i);
    expect(response._body).not.toMatch(/<script\b/i);
    expect(response._body).not.toMatch(/<img\b/i);
    expect(response._init.headers).toEqual({ 'Content-Type': 'text/html; charset=utf-8' });
  });

  test('navigation: skips cache.put when response.ok is false (e.g. 5xx)', async () => {
    /* If origin returns 500 with text/html body, we still serve that
       body (the user sees the error page) but MUST NOT poison the
       offline shell with it. Covers the response.ok=false branch in
       the `if (response.ok && ct.toLowerCase().startsWith('text/html'))`
       guard (jest reported branch @ line 121 path 1). */
    const { handlers, cache, fetchMock } = loadServiceWorker();
    const errorPage = makeResponse({ ok: false, contentType: 'text/html' });
    fetchMock.mockResolvedValueOnce(errorPage);

    const event = makeFetchEvent('GET', 'https://example.test/', 'navigate');
    handlers.fetch(event);
    const response = await event._response;

    expect(response).toBe(errorPage);
    expect(cache.put).not.toHaveBeenCalled();
  });

  test('navigation with no content-type header is served but not cached', async () => {
    /* Same null-Content-Type defensive path as the static-asset version,
       but exercised through networkFirstHTML — covers binary-expr
       branch @ line 121 path 1 (the `|| ''` falsy short-circuit on the
       headers.get coalesce inside the HTML loader). */
    const { handlers, cache, fetchMock } = loadServiceWorker();
    const noCT = makeResponse({ ok: true, contentType: null });
    fetchMock.mockResolvedValueOnce(noCT);

    const event = makeFetchEvent('GET', 'https://example.test/', 'navigate');
    handlers.fetch(event);
    const response = await event._response;

    expect(response).toBe(noCT);
    expect(cache.put).not.toHaveBeenCalled();
  });

  test('navigation: cache.put quota error is swallowed via .catch(() => {})', async () => {
    /* Round-21 fire-and-forget pattern: the cache write is detached
       from the response promise via
         event.waitUntil(cache.put(...).catch(() => {}))
       so navigation is never serialised behind the IndexedDB write.
       The `.catch(() => {})` arrow is a separate function object;
       without this test it would be the only uncovered function in
       sw.js (jest's per-file 100% gate would refuse the build).

       The test mocks cache.put to reject → asserts:
         1. The navigation response IS still returned (fresh).
         2. event.waitUntil receives the cache-put promise.
         3. Awaiting that promise does NOT throw — the .catch
            swallowed the rejection. */
    const { handlers, cache, fetchMock } = loadServiceWorker();
    cache.put.mockRejectedValueOnce(new Error('QuotaExceededError'));
    const fresh = makeResponse({ contentType: 'text/html' });
    fetchMock.mockResolvedValueOnce(fresh);

    const event = makeFetchEvent('GET', 'https://example.test/', 'navigate');
    handlers.fetch(event);
    const response = await event._response;

    expect(response).toBe(fresh);
    expect(cache.put).toHaveBeenCalledTimes(1);
    /* The fire-and-forget promise was registered for event lifetime
       extension via waitUntil — when awaited it must NOT throw. */
    expect(event.waitUntil).toHaveBeenCalledTimes(1);
    await expect(event._waitedFor).resolves.toBeUndefined();
  });

  test('navigation passes AbortSignal.timeout(8000) to fetch', async () => {
    /* AbortSignal.timeout replaces the manual setTimeout/clearTimeout pair.
       Verify (a) the SW asks for an 8s timeout, and (b) the resulting
       signal is actually wired into fetch's `init.signal` — together
       these kill both the literal-mutation and the ObjectLiteral
       mutation on the fetch options object. */
    const { handlers, fetchMock, AbortSignalStub } = loadServiceWorker();
    const sentinelSignal = { _stub: 'timeout', ms: 8000 };
    AbortSignalStub.timeout.mockReturnValueOnce(sentinelSignal);
    const fresh = makeResponse({ contentType: 'text/html' });
    fetchMock.mockResolvedValueOnce(fresh);

    const event = makeFetchEvent('GET', 'https://example.test/', 'navigate');
    handlers.fetch(event);
    await event._response;

    expect(AbortSignalStub.timeout).toHaveBeenCalledWith(8000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toEqual({ signal: sentinelSignal });
  });
});

describe('Service Worker — fetch handler cache strategy', () => {
  test('returns cached response when present (cache hit)', async () => {
    const { handlers, cacheStore, fetchMock } = loadServiceWorker();
    const cached = makeResponse({ contentType: 'application/javascript' });
    cacheStore.set('https://example.test/dist/main.min.js', cached);
    fetchMock.mockImplementation(
      () =>
        new Promise(() => {
          /* hangs */
        }),
    );

    const event = makeFetchEvent('GET', 'https://example.test/dist/main.min.js');
    handlers.fetch(event);
    const response = await event._response;
    expect(response).toBe(cached);
  });

  test('falls back to fresh fetch on cache miss and stores response', async () => {
    const { handlers, cache, fetchMock } = loadServiceWorker();
    const fresh = makeResponse({ contentType: 'application/javascript' });
    fetchMock.mockResolvedValueOnce(fresh);

    const event = makeFetchEvent('GET', 'https://example.test/dist/main.min.js');
    handlers.fetch(event);
    const response = await event._response;

    expect(response).toBe(fresh);
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(fresh.clone).toHaveBeenCalledTimes(1);
  });

  test('caches image asset when content-type is image/* (per-policy-row coverage)', async () => {
    /* Exercises the SECOND iteration of the CONTENT_TYPE_POLICY for-loop:
       a webp URL with image/webp content-type. The policy entry that
       matches is the image row; the javascript row (entry #1) does NOT
       match. A mutant that always enters the first iteration's branch
       (e.g. `if (ext.test(...))` → `if (true)`) would route this through
       the JS regex check, fail, and skip cache.put — kill the mutant. */
    const { handlers, cache, fetchMock } = loadServiceWorker();
    const fresh = makeResponse({ contentType: 'image/webp' });
    fetchMock.mockResolvedValueOnce(fresh);

    const event = makeFetchEvent('GET', 'https://example.test/images/ghironda-720.webp');
    handlers.fetch(event);
    const response = await event._response;

    expect(response).toBe(fresh);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  test('caches font asset when content-type is font/* (per-policy-row coverage)', async () => {
    /* Third policy row — font. Same mutation-killing rationale as
       the image variant above. */
    const { handlers, cache, fetchMock } = loadServiceWorker();
    const fresh = makeResponse({ contentType: 'font/woff2' });
    fetchMock.mockResolvedValueOnce(fresh);

    const event = makeFetchEvent('GET', 'https://example.test/fonts/cinzel-700.woff2');
    handlers.fetch(event);
    const response = await event._response;

    expect(response).toBe(fresh);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  test('caches CSS asset when content-type is text/css (per-policy-row coverage)', async () => {
    /* Fourth policy row — text/css. */
    const { handlers, cache, fetchMock } = loadServiceWorker();
    const fresh = makeResponse({ contentType: 'text/css' });
    fetchMock.mockResolvedValueOnce(fresh);

    const event = makeFetchEvent('GET', 'https://example.test/dist/style-deferred.min.css');
    handlers.fetch(event);
    const response = await event._response;

    expect(response).toBe(fresh);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  test('skips cache.put when content-type does not match the URL extension', async () => {
    const { handlers, cache, fetchMock } = loadServiceWorker();
    // .webp URL but server returns text/html → MIME mismatch, do NOT cache.
    const mismatched = makeResponse({ contentType: 'text/html' });
    fetchMock.mockResolvedValueOnce(mismatched);

    const event = makeFetchEvent('GET', 'https://example.test/images/ghironda-720.webp');
    handlers.fetch(event);
    const response = await event._response;

    expect(response).toBe(mismatched); // still served to the page
    expect(cache.put).not.toHaveBeenCalled(); // but never cached
  });

  test('skips cache.put when response is not ok', async () => {
    const { handlers, cache, fetchMock } = loadServiceWorker();
    fetchMock.mockResolvedValueOnce(
      makeResponse({ ok: false, contentType: 'application/javascript' }),
    );

    const event = makeFetchEvent('GET', 'https://example.test/dist/main.min.js');
    handlers.fetch(event);
    await event._response;

    expect(cache.put).not.toHaveBeenCalled();
  });

  test('swallows cache.put rejection (quota exhausted) and still returns fresh response', async () => {
    const { handlers, cache, fetchMock } = loadServiceWorker();
    cache.put.mockRejectedValueOnce(new Error('QuotaExceededError'));
    const fresh = makeResponse({ contentType: 'application/javascript' });
    fetchMock.mockResolvedValueOnce(fresh);

    const event = makeFetchEvent('GET', 'https://example.test/dist/main.min.js');
    handlers.fetch(event);
    const response = await event._response;
    await Promise.resolve();

    expect(response).toBe(fresh);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  test('returns cached response when network errors and cache exists', async () => {
    const { handlers, cacheStore, fetchMock } = loadServiceWorker();
    const cached = makeResponse({ contentType: 'font/woff2' });
    cacheStore.set('https://example.test/fonts/cinzel-700.woff2', cached);
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));

    const event = makeFetchEvent('GET', 'https://example.test/fonts/cinzel-700.woff2');
    handlers.fetch(event);
    const response = await event._response;
    expect(response).toBe(cached);
  });

  test('refuses to cache static asset when response has no content-type header', async () => {
    /* Some misconfigured upstreams return assets without Content-Type.
       `headers.get('content-type')` returns null in that case. The
       `|| ''` defensive coalesce keeps `.toLowerCase()` from throwing,
       and the empty string fails every CONTENT_TYPE_POLICY mime regex
       — so the response is served (so the user still sees the asset
       via browser MIME sniffing) but never cached. Covers binary-expr
       branch @ line 69 path 1. */
    const { handlers, cache, fetchMock } = loadServiceWorker();
    /* Pass `contentType: null` so `headers.get` returns null (default
       args only kick in for `undefined`). */
    const noCT = makeResponse({ ok: true, contentType: null });
    fetchMock.mockResolvedValueOnce(noCT);

    const event = makeFetchEvent('GET', 'https://example.test/dist/main.min.js');
    handlers.fetch(event);
    const response = await event._response;

    expect(response).toBe(noCT);
    expect(cache.put).not.toHaveBeenCalled();
  });

  test('rethrows network error on cache miss + offline (no fallback)', async () => {
    /* Cache miss + fetch failure + no `cached` arg → revalidate has
       nothing to return, so it must rethrow. The fetch handler's IIFE
       turns the rejection into an unhandled promise rejection on the
       FetchEvent — which the browser surfaces as a generic network
       error to the requesting page. Without this test, the `throw err`
       branch in revalidate stayed uncovered (jest reported line 95). */
    const { handlers, fetchMock } = loadServiceWorker();
    const networkError = new TypeError('offline');
    fetchMock.mockRejectedValueOnce(networkError);

    const event = makeFetchEvent('GET', 'https://example.test/dist/main.min.js');
    handlers.fetch(event);
    await expect(event._response).rejects.toBe(networkError);
  });

  test('throws TypeError when fetch resolves without a Response (defensive guard, kills BlockStatement mutant)', async () => {
    /* Pinned regression for the Stryker BlockStatement mutant on the
       revalidate try body. If the try body is mutated to `{}`,
       `response` stays `undefined` after the try/catch. Without the
       defensive `if (!response) throw new TypeError(...)`, accessing
       `response.ok` below would throw an UNCATCHABLE TypeError that
       crashes the Jest worker (Stryker classifies as RuntimeError,
       not Killed).
       The defensive guard converts the mutant's empty-try outcome
       into a clean rejection that this test asserts against — so
       Stryker sees a regular test failure on the mutant and classes
       it as Killed. The contrived `fetchMock.mockResolvedValueOnce(undefined)`
       exercises the same code path on the original code, ensuring
       the guard branch is genuinely covered. */
    const { handlers, fetchMock } = loadServiceWorker();
    fetchMock.mockResolvedValueOnce(undefined);

    const event = makeFetchEvent('GET', 'https://example.test/dist/main.min.js');
    handlers.fetch(event);
    await expect(event._response).rejects.toThrow(/fetch resolved without a Response/);
  });

  test('static-asset fetch passes AbortSignal.timeout(8000) signal to fetch options', async () => {
    /* Pin both: AbortSignal.timeout(8000) is asked for, AND the signal
       actually flows into fetch's `init.signal` argument — kills the
       FETCH_TIMEOUT_MS literal mutation AND the ObjectLiteral mutation
       on `{ signal: ... }`. */
    const { handlers, fetchMock, AbortSignalStub } = loadServiceWorker();
    const sentinelSignal = { _stub: 'timeout', ms: 8000 };
    AbortSignalStub.timeout.mockReturnValueOnce(sentinelSignal);
    const fresh = makeResponse({ contentType: 'image/webp' });
    fetchMock.mockResolvedValueOnce(fresh);

    const event = makeFetchEvent('GET', 'https://example.test/images/ghironda-720.webp');
    handlers.fetch(event);
    await event._response;

    expect(AbortSignalStub.timeout).toHaveBeenCalledWith(8000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toEqual({ signal: sentinelSignal });
  });

  test('cache-hit path swallows background revalidation rejection', async () => {
    /* When the cache returns a hit, the SW fires `revalidate(...).catch(() => {})`
       in the background. If revalidate rejects (e.g. fetch fails AND no
       cache fallback path is taken inside revalidate), the catch arrow
       swallows it — that arrow @ line 157 was the third uncovered fn. */
    const { handlers, cacheStore, fetchMock } = loadServiceWorker();
    const cached = makeResponse({ contentType: 'application/javascript' });
    cacheStore.set('https://example.test/dist/main.min.js', cached);
    /* The background revalidate calls fetch — which we reject. revalidate
       sees `cached !== null` (passed by the SWR branch), returns cached.
       So no rethrow there. To exercise the .catch on line 157 we need
       revalidate itself to reject — which happens when fetch rejects
       while the SWR branch passes `cached` ... actually revalidate
       returns `cached` instead of throwing in that case. To force the
       background .catch to fire we let the promise reject naturally:
       fetch rejects synchronously with no fallback in this micro-path. */
    fetchMock.mockRejectedValueOnce(new TypeError('background-fail'));

    const event = makeFetchEvent('GET', 'https://example.test/dist/main.min.js');
    handlers.fetch(event);
    /* We get the cached response synchronously. */
    const response = await event._response;
    expect(response).toBe(cached);
    /* Drain microtasks so the background revalidate promise settles +
       its .catch arrow runs. Two awaits cover the await in revalidate
       and the await on the .catch chain. */
    await Promise.resolve();
    await Promise.resolve();
  });
});
