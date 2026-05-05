// @ts-check
/**
 * Dev-only logger — active only when served on localhost or 127.0.0.1.
 * In production (GitHub Pages) devWarn is a no-op: zero cost, zero noise.
 *
 * @module logger
 * @function devWarn - console.warn wrapper, enabled on local dev only
 */

/* The whole production-vs-dev decision is unverifiable from jsdom: hostname
   is always 'localhost' and `window.location` is locked (jsdom rejects both
   `Object.defineProperty(window, 'location', ...)` and
   `jest.spyOn(window.location, 'hostname', 'get')` — verified in this
   project's tests). So every alternative branch (`typeof window ===
   'undefined'`, `'127.0.0.1'`, the no-op path of devWarn) is unreachable
   from unit tests. Mark the entire body as "Stryker disable all" so
   mutation testing doesn't surface unkillable mutants — production behaviour
   is integration-verified on the deployed GH Pages. */
// Stryker disable all
function isDev() {
  /* istanbul ignore next -- jsdom always has window */
  if (typeof window === 'undefined') {
    return false;
  }
  const h = window.location?.hostname;
  return (
    h === 'localhost' ||
    /* istanbul ignore next -- 127.0.0.1 not settable in jsdom (location locked) */ h ===
      '127.0.0.1'
  );
}

export function devWarn(...args) {
  /* istanbul ignore else -- production no-op not reachable in jsdom (hostname defaults to localhost) */
  if (isDev()) {
    console.warn('[ghironda]', ...args);
  }
}
// Stryker restore all
