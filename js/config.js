/**
 * JavaScript Modules - Configuration
 * 
 * Constanti e configurazione centralizzata per tutti i moduli.
 * Questa è la "single source of truth" per thresholds e parametri.
 * 
 * Utilizzo: import { CONFIG } from '../config.js';
 */

export const CONFIG = {
  // Intersection Observer thresholds - quando mostrare header title
  OBSERVER_THRESHOLD: [0, 0.2],
  
  // requestAnimationFrame fallback per IE11 (16.7ms = 60fps)
  RAF_FALLBACK_MS: 16,

  // Timeout attesa font load (IE11: document.fonts.ready non sempre funziona)
  FONT_LOAD_TIMEOUT_MS: 1500,

  // Selettori DOM
  SELECTORS: {
    header: 'header',
    heroH1: '.hero h1',
    headerTitleWrapper: '.header-title-wrapper',
    headerTitleLink: '.header-title-link',
    skipLinkHeader: '.skip-link-header',
    mainContent: '#main-content',
  },
  
  // CSS Custom Properties (layout)
  CSS_VARS: {
    headerHeight: '--header-height',
  },
  
  // Hero SVG fBm Configuration
  HERO_SVG: {
    pointsPerCircle: 200,      // Segmenti per disegnare ogni cerchio
    fbmOctaves: 3,             // Livelli Fractional Brownian Motion (più = più dettaglio)
    radiusSafetyFactor: 0.95,  // Fattore per non toccare esattamente il bordo hero
    viewboxFactor: 2.1,        // ViewBox size = r9 * this factor
  }
};
