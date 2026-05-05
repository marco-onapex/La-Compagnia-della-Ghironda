/**
 * Web Vitals — lightweight measurement via PerformanceObserver.
 *
 * Tracks FCP, LCP, and CLS. Results are stored on window.__vitals for
 * inspection in DevTools and marked in the Performance timeline via
 * performance.mark() so they appear in the Timings track.
 *
 * Transmission: if window.__vitalsEndpoint is set to a URL string before this
 * module runs, each metric is sent via navigator.sendBeacon as JSON:
 *   { name: 'FCP', value: 1234, url: '...' }
 * This is a no-op by default — the site is static and has no analytics server.
 * Set the endpoint in index.html before the main script to opt in:
 *   <script>window.__vitalsEndpoint = '/analytics';</script>
 *
 * @module vitals
 * @function measureWebVitals
 */

import { devWarn } from './logger.js';

/**
 * Send a single metric to the configured analytics endpoint (if any).
 *
 * @param {string} name  - Metric name ('FCP', 'LCP', 'CLS')
 * @param {number} value - Metric value (ms for timing, unitless for CLS)
 * @returns {void}
 */
function reportVital(name, value) {
  if (typeof window.__vitalsEndpoint !== 'string') {
    return;
  }
  try {
    /* Same-origin policy: refuse to ship vitals (which include the page URL
       and the visitor's referrer via beacon defaults) to a third-party
       endpoint. A page-injected script could otherwise set
       `window.__vitalsEndpoint = 'https://attacker.example/'` before main.js
       runs and exfiltrate analytics. Only relative paths or absolute URLs
       on the same origin are accepted. */
    const endpoint = new URL(window.__vitalsEndpoint, location.origin);
    if (endpoint.origin !== location.origin) {
      devWarn('[vitals] cross-origin endpoint refused:', endpoint.origin);
      return;
    }
    const payload = JSON.stringify({ name, value, url: location.href });
    navigator.sendBeacon(endpoint.href, new Blob([payload], { type: 'application/json' }));
  } catch (err) {
    devWarn('[vitals] sendBeacon failed:', err);
  }
}

/**
 * Start observing Core Web Vitals (FCP, LCP, CLS).
 * Safe to call on any browser — each observer type is wrapped in its own
 * try/catch so an unsupported type silently skips without affecting the others.
 *
 * @function measureWebVitals
 * @returns {void}
 */
export function measureWebVitals() {
  if (typeof PerformanceObserver === 'undefined') {
    return;
  }

  /* `PerformanceObserver.observe({ type: ... })` does NOT throw in
     Chromium when the entry type is unsupported — it silently logs a
     console warning ("Ignored unsupported entryTypes: <type>") and
     returns. The surrounding `try/catch` therefore can't suppress the
     warning, only an actual exception (which most browsers don't
     throw for this case). Pre-checking against
     `PerformanceObserver.supportedEntryTypes` skips the call
     entirely on engines that don't ship the type — Firefox /
     legacy Safari for `layout-shift` and `event`, etc. — so the
     console stays clean.
     `supportedEntryTypes` is a static array on the constructor,
     present in every browser that ships PerformanceObserver
     (the typeof-check above already gates that). Stryker disable
     covers the documented legacy-browser case: an engine that
     ships PerformanceObserver but not `supportedEntryTypes` (no
     real browser does — purely defensive). */
  // Stryker disable next-line ArrayDeclaration -- the `|| []` fallback covers a hypothetical legacy engine that ships PerformanceObserver without the supportedEntryTypes static; in that case the empty Set means no observers are registered. Mutating `[]` to `["Stryker was here"]` is an equivalent mutant: the placeholder string never matches any entry-type test (`'paint'`, `'largest-contentful-paint'`, etc.), so observable behavior is identical. The "handles missing supportedEntryTypes" test in vitals.test.js exercises this exact branch.
  const supported = new Set(PerformanceObserver.supportedEntryTypes || []);
  const vitals = {};
  window.__vitals = vitals;

  if (supported.has('paint')) {
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            vitals.FCP = Math.round(entry.startTime);
            performance.mark('vitals:fcp');
            reportVital('FCP', vitals.FCP);
          }
        }
      }).observe({ type: 'paint', buffered: true });
    } catch (err) {
      devWarn('[vitals] paint observer failed:', err);
    }
  }

  if (supported.has('largest-contentful-paint')) {
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          vitals.LCP = Math.round(last.startTime);
          performance.mark('vitals:lcp');
          reportVital('LCP', vitals.LCP);
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (err) {
      devWarn('[vitals] LCP observer failed:', err);
    }
  }

  if (supported.has('layout-shift')) {
    try {
      let clsValue = 0;
      new PerformanceObserver((list) => {
        for (const entry of /** @type {LayoutShiftEntry[]} */ (list.getEntries())) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        vitals.CLS = Math.round(clsValue * 1000) / 1000;
        reportVital('CLS', vitals.CLS);
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (err) {
      devWarn('[vitals] layout-shift observer failed:', err);
    }
  }

  /* INP (Interaction to Next Paint) replaced FID as a Core Web Vital in
     March 2024. We track the worst-observed interaction latency (per the
     web-vitals library convention: report the 98th percentile when there
     are >50 interactions, otherwise the max). For a static brochure site
     with few interactions, the max is a reasonable proxy.
     `durationThreshold: 40` reports only interactions slower than 40 ms,
     keeping the observer overhead negligible. */
  if (supported.has('event')) {
    try {
      let worstINP = 0;
      new PerformanceObserver((list) => {
        /* Track the worst-observed interaction across the whole batch and
           emit AT MOST ONE beacon per callback (not per entry). The
           previous version called reportVital inside the for-loop, so a
           batch of 5 increasingly-slow entries fired 5 beacons. */
        let changed = false;
        for (const entry of list.getEntries()) {
          /* `entry.duration` is a DOMHighResTimeStamp per the W3C Event
             Timing API — always a finite number ≥ 0. The previous `|| 0`
             defensive fallback was unreachable spec-wise and made the
             branch uncoverable. */
          const dur = Math.round(entry.duration);
          if (dur > worstINP) {
            worstINP = dur;
            changed = true;
          }
        }
        if (changed) {
          vitals.INP = worstINP;
          reportVital('INP', worstINP);
        }
        /* `durationThreshold` is part of the PerformanceObserverInit dict for
           `event`-type observers (W3C Event Timing API) but isn't yet in
           TypeScript's lib.dom.d.ts (5.7-6.x). Cast through any to satisfy
           strict mode without dragging in a custom .d.ts. */
      }).observe(
        /** @type {PerformanceObserverInit} */ (
          /** @type {unknown} */ ({ type: 'event', durationThreshold: 40, buffered: true })
        ),
      );
    } catch (err) {
      devWarn('[vitals] event-timing observer failed:', err);
    }
  }
}
