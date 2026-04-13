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

import { setupObserver } from './modules/observer.js';

try {

  // ⚠️ Lines 22-30: DOMContentLoaded path is NOT TESTED
  // REASON: jsdom always has document.readyState === 'complete'
  // REAL SCENARIO: Scripts loaded in <head> need this
  if (document.readyState === 'loading') {
    // DOM still loading: wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
      try {
        setupObserver();
      } catch (error) {
        void error;
        // Silent failure in DOMContentLoaded
      }
    });
  } else {
    // DOM già caricato (script inline o al fondo di body)
    // This path IS TESTED - it's the normal path in test environment
    try {
      setupObserver();
    } catch (error) {
      void error;
      // Silent failure in immediate initialization
    }
  }
} catch (error) {
  void error;
  // Silent failure at initialization
}
