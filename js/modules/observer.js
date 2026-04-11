/**
 * JavaScript Modules - Intersection Observer
 * 
 * Monitora due aspetti della pagina:
 * 1. Visibilità del titolo hero (h1) nel viewport
 *    → Mostra/nasconde logo dinamico nell'header quando h1 esce dal view
 * 2. Sezioni attive per navigazione aria-current
 *    → Traccia quale sezione è visibile nel viewport
 *    → Aggiorna aria-current="page" sul link di navigazione corrispondente
 * 
 * Implementa due Intersection Observer per performance ottimale
 * (uno per hero title, uno per sezioni).
 * 
 * Features:
 * - Caching dello stato per evitare DOM mutations inutili
 * - Error handling completo
 * - Fallback se IntersectionObserver non disponibile
 * 
 * @module observer
 * @function setupObserver - Setup Intersection Observer per hero e sezioni
 * @returns {void}
 */

import { CONFIG } from '../config.js';

let lastLogoState = false; // Cache stato visibilità

/**
 * Setup Intersection Observer per hero title e sezioni
 * 
 * Monitora:
 * 1. Hero title visibility → Mostra/nascondi header logo dinamico
 * 2. Section visibility → Aggiorna aria-current per nav
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

    // 1. Observer per titolo hero
    const heroTitle = document.querySelector(CONFIG.SELECTORS.heroH1);
    const titleWrapper = document.querySelector(CONFIG.SELECTORS.headerTitleWrapper);
    const titleLink = document.querySelector(CONFIG.SELECTORS.headerTitleLink);
  
    if (heroTitle && titleWrapper) {
      try {
        const observer = new IntersectionObserver(
          (entries) => {
            try {
              entries.forEach((entry) => {
                // ratio >= 0.2: titolo è almeno 20% visibile = nascondi header title
                // ratio < 0.2: titolo è <20% visibile (uscì dal viewport) = mostra header title
                const shouldShowHeaderTitle = entry.intersectionRatio < 0.2;
                
                // Evita manipolazione DOM inutile
                if (shouldShowHeaderTitle !== lastLogoState) {
                  if (shouldShowHeaderTitle) {
                    titleWrapper.classList.add('visible');
                    if (titleLink) {
                      titleLink.setAttribute('aria-hidden', 'false');
                      titleLink.setAttribute('tabindex', '0');
                    }
                  } else {
                    titleWrapper.classList.remove('visible');
                    if (titleLink) {
                      titleLink.setAttribute('aria-hidden', 'true');
                      titleLink.setAttribute('tabindex', '-1');
                    }
                  }
                  lastLogoState = shouldShowHeaderTitle;
                }
              });
            } catch (error) {
              void error;
              // Silent error handling
            }
          },
          { threshold: CONFIG.OBSERVER_THRESHOLD }
        );
        
        observer.observe(heroTitle);
      } catch (error) {
        void error;
        // Silent error handling
      }
    }
  
    // 2. Observer per sezioni attive (aria-current)
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
    
        // Leggi altezza header dalla CSS variable (impostata da header.js)
        // Fallback a 85px se non ancora disponibile
        const headerHeightPx = parseInt(
          getComputedStyle(document.documentElement).getPropertyValue('--header-height')
        ) || 85;

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

/**
 * Reset the internal state - used for testing
 * @internal
 * @returns {void}
 */
export function __resetObserverState() {
  lastLogoState = false;
}
