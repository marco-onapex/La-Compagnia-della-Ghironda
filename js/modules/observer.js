/**
 * JavaScript Modules - Intersection Observer
 *
 * Monitora le sezioni attive per navigazione aria-current:
 * → Traccia quale sezione è visibile nel viewport
 * → Aggiorna aria-current="page" sul link di navigazione corrispondente
 *
 * Note: Il toggle header title (skip-link ↔ title-link) è ora gestito
 * tramite CSS Scroll-Driven Animations (css/4-header.css).
 *
 * Features:
 * - Error handling completo
 * - Fallback se IntersectionObserver non disponibile
 *
 * @module observer
 * @function setupObserver - Setup Intersection Observer per sezioni
 * @returns {void}
 */

import { CONFIG } from '../config.js';

/**
 * Setup Intersection Observer per sezioni attive (aria-current)
 *
 * @function setupObserver
 * @returns {void}
 */
export function setupObserver() {
  try {
    // Validazione CONFIG
    if (!CONFIG?.SELECTORS || !CONFIG?.OBSERVER_THRESHOLD) {
      return;
    }

    // Feature detection: IntersectionObserver
    if (!window.IntersectionObserver) {
      return;
    }

    // Observer per sezioni attive (aria-current)
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('nav a[href^="#"]');

    if (sections.length > 0 && navLinks.length > 0) {
      try {
        // Mapper tra ID sezione e href link
        const sectionMap = {};
        navLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (href && href.startsWith('#')) {
            const sectionId = href.slice(1);
            sectionMap[sectionId] = link;
          }
        });

        // Leggi altezza header direttamente dal DOM
        // Fallback a 85px se header non disponibile
        const header = document.querySelector(CONFIG.SELECTORS.header);
        const headerHeightPx = (header && header.offsetHeight) || 85;

        const sectionObserver = new IntersectionObserver(
          (entries) => {
            try {
              entries.forEach((entry) => {
                const sectionId = entry.target.id;
                const link = sectionMap[sectionId];

                if (!link) {
                  return;
                }

                if (entry.isIntersecting) {
                  // Rimuovi aria-current da tutti i link
                  navLinks.forEach(l => {
                    l.removeAttribute('aria-current');
                  });

                  // Aggiungi aria-current al link attivo
                  link.setAttribute('aria-current', 'page');
                } else {
                  // Quando una sezione esce dal viewport, rimuovi aria-current
                  if (link.getAttribute('aria-current') === 'page') {
                    link.removeAttribute('aria-current');
                  }
                }
              });
            } catch (error) {
              void error;
              // Silent error handling
            }
          },
          {
            // Trigger quando la sezione entra nel viewport (con offset della header height reale)
            rootMargin: `-${headerHeightPx}px 0px -66% 0px`,
            threshold: [0, 0.5]
          }
        );

        sections.forEach(section => {
          try {
            sectionObserver.observe(section);
          } catch (error) {
            void error;
            // Silent error handling
          }
        });
      } catch (error) {
        void error;
        // Silent error handling
      }
    }
  } catch (error) {
    void error;
    // Silent error handling
  }
}
