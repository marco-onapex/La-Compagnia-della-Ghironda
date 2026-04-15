/**
 * JavaScript Entry Point - Main
 *
 * Orchestrazione dell'inizializzazione di tutti i moduli JavaScript.
 *
 * Sequenza:
 * 1. Su DOMContentLoaded o se DOM già loaded:
 *    - setupObserver() - Setup Intersection Observer per sezioni aria-current
 *
 * Note: header height CSS e SVG topografia sono ora gestiti in CSS puro.
 *
 * Error handling: Wrapped in try-catch blocks (silent failures)
 *
 * Eseguito come: <script src="dist/main.min.js"></script> in index.html
 */

import { installRequestAnimationFramePolyfill } from './modules/polyfills.js';
import { setupObserver, setupHeaderToggle, setupNavToggle, setupHeaderHeight } from './modules/observer.js';

// --header-h: valore iniziale impostato dall'inline script dopo </header>.
// setupHeaderHeight() mantiene il valore aggiornato via ResizeObserver quando
// il nav expand/collassa o il viewport cambia dimensione.

installRequestAnimationFramePolyfill();

try {

  // jsdom always has readyState === 'complete'; this branch runs only in real browsers
  // when the script is loaded in <head>. istanbul ignore: untestable in jsdom.
  /* istanbul ignore next */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        setupObserver();
        setupHeaderToggle();
        setupNavToggle();
        setupHeaderHeight();
      } catch (error) {
        void error;
      }
    });
  } else {
    // DOM already loaded — normal path when script is at end of <body>
    try {
      setupObserver();
      setupHeaderToggle();
      setupNavToggle();
      setupHeaderHeight();
    } catch (error) {
      /* istanbul ignore next */
      void error;
    }
  }
} catch (error) {
  /* istanbul ignore next */
  void error;
}
