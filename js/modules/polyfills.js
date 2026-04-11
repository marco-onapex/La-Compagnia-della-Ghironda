/**
 * JavaScript Modules - Polyfills
 * 
 * IE11 compatibility shims per browser legacy.
 * Installa polyfill per requestAnimationFrame/cancelAnimationFrame.
 * 
 * @module polyfills
 * @function installRequestAnimationFramePolyfill - Installa RAF polyfill se assente
 * @returns {void}
 */

/**
 * Installa polyfill requestAnimationFrame/cancelAnimationFrame per IE11
 * 
 * requestAnimationFrame fallback: setTimeout con 16ms (~60fps)
 * cancelAnimationFrame fallback: clearTimeout corrispondente
 * 
 * @function installRequestAnimationFramePolyfill
 * @returns {void}
 */
export function installRequestAnimationFramePolyfill() {
  try {
    // ⚠️ Line 25: window check NOT TESTED
    // REASON: window always exists in test environment
    // Validazione: window deve essere disponibile
    if (!window) {
      return;
    }

    // requestAnimationFrame polyfill
    // ⚠️ Lines 34, 44-48: IE11 polyfill fallback paths NOT TESTED
    // REASON: Tests mock window.requestAnimationFrame as real function
    // Browser detection: wenn RAF already exists, code below skipped
    if (!window.requestAnimationFrame) {
      window.requestAnimationFrame = function(callback) {
        if (typeof callback !== 'function') {
          return null;
        }
        return setTimeout(callback, 16); // ~60fps fallback
      };
    }
    
    // cancelAnimationFrame polyfill
    if (!window.cancelAnimationFrame) {
      window.cancelAnimationFrame = function(id) {
        if (typeof id !== 'number') {
          return;
        }
        return clearTimeout(id);
      };
    }
  } catch (error) {
    void error;
    // Silent failure
  }
}
