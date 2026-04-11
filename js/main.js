/**
 * JavaScript Entry Point - Main
 * 
 * Orchestrazione dell'inizializzazione di tutti i moduli JavaScript.
 * 
 * Sequenza:
 * 1. Su DOMContentLoaded o se DOM già loaded:
 *    - initHeaderListener() - Misura header height
 *    - setupObserver() - Setup Intersection Observer
 *    - setupHeroCircles() - Genera SVG topografia (deferred via requestIdleCallback)
 * 
 * Error handling: Wrapped in try-catch blocks (silent failures)
 * 
 * Eseguito come: <script src="dist/main.min.js"></script> in index.html
 */

import { initHeaderListener } from './modules/header.js';
import { setupObserver } from './modules/observer.js';
import { setupHeroCircles } from './modules/hero.js';

try {

  // 2. Inizializza listener per altezza header + observer + hero SVG
  // ⚠️ Lines 30-57: DOMContentLoaded path is NOT TESTED
  // REASON: jsdom always has document.readyState === 'complete'
  // REAL SCENARIO: Scripts loaded in <head> need this
  if (document.readyState === 'loading') {
    // DOM still loading: wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
      try {
        initHeaderListener();
        setupObserver();
        
        // Defer non-critical SVG generation usando requestIdleCallback
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            try {
              setupHeroCircles();
            } catch (error) {
              void error;
              // Silent failure
            }
          });
        } else {
          // Fallback for requestIdleCallback compatibility
          setTimeout(() => {
            try {
              setupHeroCircles();
            } catch (error) {
              void error;
              // Silent failure
            }
          }, 1000);
        }
      } catch (error) {
        void error;
        // Silent failure in DOMContentLoaded
      }
    });
  } else {
    // DOM già caricato (script inline o al fondo di body)
    // This path IS TESTED - it's the normal path in test environment
    // DOM already loaded
    try {
      initHeaderListener();
      setupObserver();
      
      // Defer non-critical SVG generation
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          try {
            setupHeroCircles();
          } catch (error) {
            void error;
            // Silent failure
          }
        });
      } else {
        // Fallback for requestIdleCallback compatibility
        setTimeout(() => {
          try {
            setupHeroCircles();
          } catch (error) {
            void error;
            // Silent failure
          }
        }, 1000);
      }
    } catch (error) {
      void error;
      // Silent failure in immediate initialization
    }
  }
} catch (error) {
  void error;
  // Silent failure at initialization
}
