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
import { setupObserver, setupHeaderToggle } from './modules/observer.js';

// --header-h è interamente gestita in CSS (css/4-header.css) per breakpoint:
// nessun aggiornamento JS post-paint → CLS = 0.000 garantito.

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
      } catch (error) {
        void error;
      }
    });
  } else {
    // DOM already loaded — normal path when script is at end of <body>
    try {
      setupObserver();
      setupHeaderToggle();
    } catch (error) {
      /* istanbul ignore next */
      void error;
    }
  }
} catch (error) {
  /* istanbul ignore next */
  void error;
}
