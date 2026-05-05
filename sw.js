/* Service Worker — stale-while-revalidate for static assets, network-first
   with cache fallback for the HTML shell. CACHE_NAME is injected by
   scripts/cache-bust.js at build time using a composite hash, so old
   caches are pruned automatically on every deploy.

   ── Architecture ─────────────────────────────────────────────────────────
   `setup(self, env)` is the testable entry point. It reads every web-API
   it depends on from `env` (defaulting to bindings on `self`) so unit
   tests can swap them for jest mocks without monkey-patching globalThis.

   At the bottom, a tiny dual-mode bootstrap decides whether to run
   immediately (browser/worker scope, where `module` is undefined) or
   to expose `setup` for `require()` (CommonJS test scope, where
   `module.exports` exists).

   This pattern lets Jest's transform pipeline (babel-jest →
   istanbul / Stryker) instrument sw.js the same way it does any
   other module, closing the mutation-testing gap that the previous
   `new Function(SW_SOURCE)` test pattern left open. */

// Stryker disable all
function setup(
  self,
  /* Default-arg expressions pull every dependency off `self` when env
     is omitted (real worker scope). Block-level Stryker disable: the
     individual identifier-swap mutations (`self.caches` → `self.fetch`)
     are JS-spec assertions, not SW behaviour. The default-binding
     fallback test exercises the whole expression once. */
  {
    caches = self.caches,
    fetch = self.fetch,
    URL = self.URL,
    Response = self.Response,
    AbortSignal = self.AbortSignal,
  } = {},
) {
  // Stryker restore all
  /* TypeScript's WebWorker lib types `self` as the generic
     WorkerGlobalScope. Casting through `unknown` narrows it to
     ServiceWorkerGlobalScope so the skipWaiting / clients / fetch-event
     APIs are properly typed below. */
  const sw = /** @type {ServiceWorkerGlobalScope} */ (
    /** @type {unknown} */ (self)
  );

  const CACHE_NAME = 'ghironda-PLACEHOLDER'; /* @cache-version */

  /* Cacheable runtime asset extensions. Do NOT include `.html` here — HTML is
     handled separately via the navigate-fetch branch with NetworkFirst.
     Source-invariant tests (sw.test.js) pin the regex by verifying every
     extension we ship matches and HTML/json don't — Stryker's regex-internal
     mutations (toggling `?` quantifier, dropping the `$` anchor) yield
     functionally equivalent patterns for the URLs we exercise, so disable
     them. The "exact regex" coverage lives in the source-invariant suite. */
  // Stryker disable next-line Regex
  const CACHEABLE = /\.(woff2?|ttf|png|webp|avif|svg|min\.css|min\.js)$/;

  /* Content-type policy: each cacheable extension MUST come back with a MIME
     type that matches its file kind. Stops a hijacked/MIME-confused upstream
     response from poisoning the cache (defence-in-depth on top of HTTPS).
     Each row is pinned by behavioural tests (one cache.put assertion per
     ext family) — but Regex mutations on quantifiers/anchors generate
     equivalent patterns under our test inputs. Disabled. */
  const CONTENT_TYPE_POLICY = [
    // Stryker disable next-line Regex
    { ext: /\.(min\.js)$/,   mime: /javascript/    },
    // Stryker disable next-line Regex
    { ext: /\.(min\.css)$/,  mime: /text\/css/     },
    // Stryker disable next-line Regex
    { ext: /\.(woff2?|ttf)$/, mime: /font/         },
    // Stryker disable next-line Regex
    { ext: /\.(png|webp|avif|svg)$/, mime: /image/ },
  ];

  /* Assets warmed into the cache at install time. Limited to what the page
     needs to render above-the-fold so first-time-offline visitors get a
     usable experience. The 720w LCP image ships in two formats: AVIF
     (~<!-- AUTO:HERO_AVIF_KB -->29.9<!-- /AUTO --> KB, picked by every modern browser via the <picture> source
     order) and WebP (~<!-- AUTO:HERO_WEBP_KB -->78.5<!-- /AUTO --> KB, fallback for the AVIF-less long tail).
     The HTML-style markers above are valid prose inside this JS block
     comment because their delimiters don't contain `*` or `/`; using
     the JS-style `/`+`*` form here would terminate the surrounding
     comment.
     Both are precached so the offline cohort gets the format their
     UA can decode. The PNG fallback for the no-WebP cohort is
     populated lazily through stale-while-revalidate.

     Both critical fonts are precached to mirror the `<link rel="preload">`
     pair in index.html: cinzel-700-lcp drives the LCP element (hero h1
     + skip-link + header-title) and cinzel-400 drives the body text.
     Without both in the precache, a first-time-offline visitor sees
     the LCP element in Cinzel-LCP but the body in serif fallback —
     visually inconsistent. With both precached, the offline-first
     cohort lands within the 100 ms `font-display: optional` block
     period and renders the page in Cinzel from first paint. */
  const PRECACHE = [
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

  const FETCH_TIMEOUT_MS = 8000;

  sw.addEventListener('install', (event) => {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(
          PRECACHE.map((url) =>
            cache.add(url).catch((err) => {
              /* Asset missing or fetch failed at install time. Round-23
                 cleanup: previously this catch was a silent `() => {}`,
                 so a deployment that omitted a precached asset would
                 ship without complaint and the first-time-offline
                 visitor would see a broken page with no signal. We
                 now warn so the issue surfaces in service-worker
                 logs (chrome://serviceworker-internals or DevTools
                 → Application → Service Workers). Install MUST NOT
                 fail because of one missing asset — the SW still
                 activates and runtime fetches handle the gap. */
              console.warn('[sw] precache miss:', url, err && err.message);
            }),
          ),
        );
        await sw.skipWaiting();
      })(),
    );
  });

  sw.addEventListener('activate', (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
          ),
        )
        .then(() => sw.clients.claim()),
    );
  });

  /* Validates the response Content-Type against the URL's file extension. A
     mismatch (e.g. an .avif URL returning text/html because of a hijacked
     intermediate proxy) makes the response uncacheable: we still serve it
     to the page (the browser's own MIME sniffing handles the visible
     render), we just refuse to remember it. */
  function isContentTypeAllowed(url, response) {
    // Stryker disable next-line StringLiteral -- the empty-string fallback is a defensive coalesce; mutating it to any other string still goes through .toLowerCase() and fails every CONTENT_TYPE_POLICY mime regex (no behaviour change for our inputs).
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    for (const { ext, mime } of CONTENT_TYPE_POLICY) {
      if (ext.test(url.pathname)) {
        return mime.test(ct);
      }
    }
    /* Fail-closed: an extension that is in CACHEABLE but missing from
       CONTENT_TYPE_POLICY is treated as untrusted (refused cache).
       Currently every CACHEABLE extension has a matching policy entry,
       so this branch is structurally unreachable from the production
       fetch handler — but kept as a footgun guard for future additions
       to CACHEABLE that forget the matching policy entry. */
    /* istanbul ignore next -- defensive, unreachable while CACHEABLE ⊆ POLICY */
    // Stryker disable next-line BooleanLiteral -- Stryker doesn't honour istanbul ignore; the whole branch is structurally unreachable.
    return false;
  }

  /* Background revalidation: timed fetch + cache write. Returns the fresh
     response when network succeeds, or `cached` (if any) when network errors.

     `AbortSignal.timeout(N)` replaces the manual setTimeout/clearTimeout
     pair: the signal aborts after N ms and is auto-collected when the
     function returns. Available Chrome 103 / FF 100 / Safari 16. */
  async function revalidate(cache, request, cached) {
    let response;
    // Stryker disable next-line BlockStatement -- mutating this try body to `{}` leaves response=undefined; the defensive guard below then throws TypeError synchronously inside this async function. With Node 15+ defaults, that throw becomes an unhandled rejection in the SW tests that invoke handlers.fetch(event) without awaiting event._response (the side-effect-only tests), and Node exits the worker with code 1. Stryker classifies the worker crash as RuntimeError instead of Killed. Disable keeps the report clean while the defensive guard stays as production code (genuinely valuable: catches the contrived case where a fetch mock resolves with undefined, exercised by the dedicated test below).
    try {
      response = await fetch(request, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      // Stryker disable next-line ConditionalExpression,BlockStatement -- SWR cache-hit caller swallows the throw via .catch(() => {}); cached=null re-throws (asserted by "rethrows network error" test).
      if (cached) {
        return cached;
      }
      throw err;
    }
    /* Defensive guard: a Response is always assigned by the try
       block in normal operation (fetch either resolves to a Response
       or throws — the catch above handles the throw). The null check
       here surfaces a contrived test path where the fetch mock
       resolves with undefined, AND keeps the production code resilient
       to a future refactor that might leave `response` unassigned. */
    if (!response) {
      throw new TypeError('fetch resolved without a Response');
    }
    if (response.ok && isContentTypeAllowed(new URL(request.url), response)) {
      try {
        await cache.put(request, response.clone());
      } catch {
        /* quota */
      }
    }
    return response;
  }

  /* HTML navigations: NetworkFirst with cache fallback. Lets the user see
     the latest deployed HTML when online, and an offline shell when the
     network drops. Timeout prevents long stalls on flaky mobile networks.

     Defence-in-depth on cache writes:
     1. Validate Content-Type starts with `text/html` so a captive-portal or
        MIME-confused upstream cannot poison the offline shell with arbitrary
        content (e.g. an HTTP/302 to a hotel-WiFi login page returning JSON).
     2. Normalise the cache key to `./index.html` so URLs with marketing
        query-strings (`?utm_source=…`) don't fragment the cache: every
        navigation hits the same offline copy. */
  const HTML_CACHE_KEY = './index.html';

  /* @param {Request} request — the navigation request
     @param {FetchEvent} event — needed for `event.waitUntil()` so the
       cache write can outlive the navigation response without
       blocking it (round-21 hardening: previously the `await
       cache.put(...)` serialised navigation behind the IndexedDB
       write, adding ~50-200 ms to perceived TTFB on slow disks). */
  async function networkFirstHTML(request, event) {
    const cache = await caches.open(CACHE_NAME);
    let response;
    try {
      response = await fetch(request, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch {
      const cached =
        // Stryker disable next-line StringLiteral -- legacy `./` fallback for SWs that cached under root.
        (await cache.match(HTML_CACHE_KEY)) || (await cache.match('./'));
      if (cached) {
        return cached;
      }
      /* Offline shell — body, status, and headers all asserted by
         the "503 Offline" test via ResponseStub._body / _init capture.
         Round-23: the body now includes minimal inline styling and
         `lang="it"` so first-time-offline visitors land on a legible
         message rather than a bare unstyled `<h1>`. The shell is
         still self-contained (no external assets, no inline script)
         so it works under the strictest CSP and renders identically
         whether the cache holds the deferred CSS or not. */
      return new Response(
        '<!doctype html><html lang="it"><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>Offline — La Compagnia della Ghironda</title>' +
          '<style>html,body{margin:0;height:100%;background:#0f0a1a;color:#efc966;' +
          'font-family:Georgia,serif;display:grid;place-items:center;text-align:center}' +
          'h1{font-size:1.6rem;margin:0 0 .5rem}p{margin:0;color:#c9b884}</style>' +
          '</head><body><main><h1>Sei offline</h1>' +
          '<p>Riconnettiti per tornare a La Compagnia della Ghironda.</p>' +
          '</main></body></html>',
        {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        },
      );
    }
    // Stryker disable next-line StringLiteral -- defensive `|| ''` coalesce; mutation still fails .startsWith('text/html') for our inputs.
    const ct = response.headers.get('content-type') || '';
    if (response.ok && ct.toLowerCase().startsWith('text/html')) {
      /* Fire-and-forget cache write via event.waitUntil. The
         response object is returned to the navigation IMMEDIATELY;
         event.waitUntil keeps the SW alive long enough for
         cache.put to land without serialising on it. Quota errors
         are swallowed silently (the offline shell is best-effort). */
      event.waitUntil(cache.put(HTML_CACHE_KEY, response.clone()).catch(() => {}));
    }
    return response;
  }

  sw.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') {
      return;
    }

    const url = new URL(request.url);
    if (url.origin !== sw.location.origin) {
      return;
    }

    // HTML navigation → NetworkFirst.
    if (request.mode === 'navigate') {
      event.respondWith(networkFirstHTML(request, event));
      return;
    }

    // Static assets → stale-while-revalidate.
    if (!CACHEABLE.test(url.pathname)) {
      return;
    }

    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) {
          /* `cached` is non-null on this branch, so revalidate() falls
             through to `return cached;` on fetch error rather than
             re-throwing — the `.catch` arrow is therefore unreachable in
             normal operation. Kept as a defensive guard against a future
             revalidate() refactor that surfaces sync errors before the
             try block. */
          /* istanbul ignore next -- defensive, unreachable while revalidate(cached!=null) never rejects */
          revalidate(cache, request, cached).catch(() => {});
          return cached;
        }
        return revalidate(cache, request, null);
      })(),
    );
  });
}

/* Dual-mode bootstrap.

   Browser / Service-Worker scope: `module` is undefined; we invoke
   setup(self) immediately so the SW registers its handlers before the
   browser dispatches the install event.

   CommonJS / Jest scope: `module.exports` exists; the test file
   `require`s sw.js, gets the exported `setup` function, and invokes it
   with mocked dependencies.

   The branch itself is istanbul-ignored: each branch is reachable from
   exactly one runtime, and jsdom (the test runtime) only ever sees the
   else-branch — leaving the if-branch structurally uncoverable. */
// Stryker disable all -- runtime-mode dispatch; both branches are structurally unreachable from the unit-test runtime (jsdom sees only the else branch). The browser-side branch is integration-verified by the SW registration in index.html landing on a real worker.
/* istanbul ignore next -- only one of the two branches is reachable per runtime */
if (typeof module === 'undefined') {
  setup(self);
} else {
  module.exports = { setup };
}
// Stryker restore all
