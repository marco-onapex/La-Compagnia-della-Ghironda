/**
 * JavaScript Modules - Configuration
 *
 * Constanti e configurazione centralizzata per tutti i moduli.
 * Questa è la "single source of truth" per thresholds e parametri.
 *
 * Utilizzo: import { CONFIG } from '../config.js';
 */

export const CONFIG = {
  // Intersection Observer thresholds - per sezioni aria-current
  OBSERVER_THRESHOLD: [0, 0.5],

  // Selettori DOM
  SELECTORS: {
    header: 'header',
  },
};
