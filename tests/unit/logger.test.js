/**
 * logger.js unit tests.
 *
 * isDev() is evaluated lazily on every devWarn call. jsdom's default URL
 * is http://localhost/ so the dev path runs naturally; the production
 * path requires overriding `window.location.hostname` via
 * Object.defineProperty inside an isolated module load.
 */

import { devWarn } from '../../js/modules/logger.js';

describe('logger module — dev path (jsdom hostname=localhost)', () => {
  test('devWarn calls console.warn with [ghironda] prefix', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    devWarn('test message');
    expect(warnSpy).toHaveBeenCalledWith('[ghironda]', 'test message');
    warnSpy.mockRestore();
  });

  test('devWarn forwards multiple arguments', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    devWarn('msg', { extra: true }, 42);
    expect(warnSpy).toHaveBeenCalledWith('[ghironda]', 'msg', { extra: true }, 42);
    warnSpy.mockRestore();
  });

  test('devWarn with no arguments calls console.warn with only the prefix', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    devWarn();
    expect(warnSpy).toHaveBeenCalledWith('[ghironda]');
    warnSpy.mockRestore();
  });
});

/* The production no-op branch (`isDev() === false`) and the
   `'127.0.0.1'` alternative loopback ARE NOT REACHABLE from jsdom.
   We tried in Apr 2026:
   - `jest.spyOn(window.location, 'hostname', 'get')` → throws
     "Property `hostname` is not declared configurable"
   - `Object.defineProperty(window, 'location', { value: stub })` →
     throws "Cannot redefine property: location"
   - jsdom URL navigation via history.replaceState only changes path,
     not hostname (and cross-origin nav is rejected for security).
   The branches stay `istanbul ignore`'d in logger.js for that reason,
   and the entire isDev/devWarn body is wrapped in `// Stryker disable
   all` so mutation testing does not surface unkillable mutants on
   this surface. Production behaviour is integration-verified on the
   deployed GH Pages (any console.warn there would be visible to
   anyone opening DevTools on the live site). */
