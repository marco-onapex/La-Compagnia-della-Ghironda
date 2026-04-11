/**
 * JavaScript Modules - Header Height Management
 * 
 * Misura altezza reale dell'header e la salva in CSS Custom Property.
 * Necessario per calcoli di scroll-margin-top e positioning corretto.
 * 
 * @module header
 * @function updateHeaderHeight - Misura e salva altezza header in CSS variable
 * @function initHeaderListener - Setup event listeners e initial measurement
 * @returns {void}
 */

import { CONFIG } from '../config.js';

/**
 * Misura l'altezza reale dell'header e la salva in CSS Custom Property
 * 
 * @function updateHeaderHeight
 * @returns {void}
 */
export function updateHeaderHeight() {
  try {
    // Validazione CONFIG
    if (!CONFIG || !CONFIG.SELECTORS || !CONFIG.CSS_VARS) {
      return;
    }

    const header = document.querySelector(CONFIG.SELECTORS.header);
    
    if (!header) {
      return;
    }

    const height = header.offsetHeight;
    
    // Validazione: height deve essere numero positivo
    if (!Number.isFinite(height) || height <= 0) {
      return;
    }

    document.documentElement.style.setProperty(CONFIG.CSS_VARS.headerHeight, `${height}px`);
  } catch (error) {
    void error;
    // Silent failure
  }
}

/**
 * Inizializza listener per aggiornamento dinamico altezza header
 * Monitora: window resize, font loading
 * 
 * @function initHeaderListener
 * @returns {void}
 * @listens resize - Aggiorna altezza al resize
 * @listens document.fonts.ready - Aggiorna quando font caricano
 */
export function initHeaderListener() {
  try {
    // Aggiorna subito
    updateHeaderHeight();
    
    // Aggiorna al resize (con debounce interno via RAF)
    let resizeTimer;
    const debouncedUpdate = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateHeaderHeight, 100);
    };
    
    window.addEventListener('resize', debouncedUpdate);
    
    // Font loading monitoring
    // REASON: document.fonts is mocked in tests, always has .ready
    // Aggiorna quando font caricano (IE11 compatibility)
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready
        .then(() => {
          updateHeaderHeight();
        })
        .catch(() => {
          // Silent failure - fallback via timeout
          setTimeout(updateHeaderHeight, CONFIG.FONT_LOAD_TIMEOUT_MS);
        });
    } else {
      // ⚠️ Lines 83-86: IE11 fallback without document.fonts NOT TESTED
      // REASON: jsdom always provides document.fonts mock in tests
      // Fallback per IE11: font loading detection con timeout
      setTimeout(updateHeaderHeight, CONFIG.FONT_LOAD_TIMEOUT_MS);
    }
  } catch (error) {
    void error;
    // Silent failure in header listener initialization
  }
}
