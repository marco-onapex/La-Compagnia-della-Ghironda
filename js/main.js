import { setupHeaderToggle } from './modules/header-toggle.js';
import { devWarn } from './modules/logger.js';
import { measureWebVitals } from './modules/vitals.js';

/* Pure CSS architecture (April 2026 refactor): every "graphical logic"
   that JS used to drive — active-section nav highlight, hamburger menu
   toggle, header-height layout token, skip-link↔title-link cross-fade —
   is now handled by CSS scroll-driven animations + the checkbox-hack
   pattern + static --header-h tokens. The remaining JS responsibilities are:

     1. Deferred CSS loader (this file) — applies the below-the-fold
        bundle on the `load` event so style-recalc lands AFTER the LCP
        detection window. Loading is plumbing, not graphics.

     2. Web Vitals measurement (./modules/vitals.js) — analytics.

     3. Skip-link ↔ title-link fallback (./modules/header-toggle.js) —
        a single body classList.toggle, ONLY on engines that lack
        `animation-timeline: view()` support (Safari ≤25, legacy
        Chromium / Firefox). On modern browsers the module bails out
        before any DOM access and CSS owns the cross-fade entirely.
        Round-23 restored this fallback after the Apr-2026 refactor
        had left older engines with a permanently-visible skip-link. */

/* Web Vitals beacon activation — opt-in via `?vitals=PATH` URL param.
   Setting `window.__vitalsEndpoint` here (BEFORE `measureWebVitals()`
   fires) routes FCP/LCP/CLS/INP to a same-origin POST endpoint via
   sendBeacon. Cross-origin endpoints are refused inside vitals.js as
   defence-in-depth, so the URL param can only point at a same-origin
   path no matter what a visitor types.

   Usage example: open `https://site/?vitals=/__vitals` to send beacons
   to `/__vitals` while tracing performance. The path doesn't need to
   resolve — sendBeacon is fire-and-forget; a 404 doesn't surface to
   the page. For a real analytics pipeline, point at a same-origin
   endpoint that captures and forwards (e.g. a Cloudflare Worker).

   This converts vitals.js from "shipped but never wired" to "ready
   with a one-step activation" without committing to any vendor or
   adding inline scripts that would need a fresh CSP hash. */
const vitalsParam = new URLSearchParams(location.search).get('vitals');
if (vitalsParam) {
  window.__vitalsEndpoint = vitalsParam;
}

// Deferred (below-the-fold) CSS — typography for sections + footer + print.
(function loadDeferredCSS() {
  const apply = () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'dist/style-deferred.min.css';
    link.onload = () => {
      window.__deferredCssLoaded = true;
    };
    /* If the stylesheet 404s, fails CORS, or is blocked by a CSP
       mismatch, silently leaving `__deferredCssLoaded` false is a
       diagnostic dead end. Forward to devWarn so the dev console shows
       a single line on localhost; production stays silent. */
    link.onerror = () => {
      window.__deferredCssLoaded = false;
      devWarn('[main] deferred CSS failed to load:', link.href);
    };
    document.head.appendChild(link);
  };
  if (document.readyState === 'complete') {
    apply();
  } else {
    window.addEventListener('load', apply, { once: true });
  }
})();

measureWebVitals();

setupHeaderToggle();

if ('serviceWorker' in navigator) {
  // Explicit `scope: './'` so a future move to org-level Pages doesn't
  // accidentally widen the SW's reach to all sibling project pages.
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(devWarn);
}
