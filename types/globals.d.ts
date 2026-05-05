/**
 * Ambient type declarations for site-specific window globals.
 *
 * These properties are intentionally attached to `window` so DevTools and
 * external diagnostics (e.g. Lighthouse audits) can inspect runtime state
 * without bundling extra observability code into the main path.
 */

declare global {
  interface VitalsRecord {
    FCP?: number;
    LCP?: number;
    CLS?: number;
    INP?: number;
  }

  /**
   * `layout-shift` PerformanceEntry — defined in the W3C Layout Instability spec
   * but not yet in TypeScript's bundled lib.dom.d.ts (as of TS 5.7).
   */
  interface LayoutShiftEntry extends PerformanceEntry {
    readonly value: number;
    readonly hadRecentInput: boolean;
  }

  interface Window {
    /** Set to true once dist/style-deferred.min.css finishes loading. */
    __deferredCssLoaded?: boolean;
    /** Optional analytics endpoint. If a string, vitals are POSTed via sendBeacon. */
    __vitalsEndpoint?: string;
    /** Live record of measured Core Web Vitals (mutated as observers fire). */
    __vitals?: VitalsRecord;
  }
}

export {};
