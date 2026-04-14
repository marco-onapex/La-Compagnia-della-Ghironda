/**
 * JavaScript Modules - Intersection Observer
 *
 * Monitora le sezioni attive per navigazione aria-current:
 * → Traccia quale sezione è visibile nel viewport
 * → Aggiorna aria-current="page" sul link di navigazione corrispondente
 *
 * setupHeaderToggle: toggle skip-link ↔ title-link nell'header.
 * → CSS Scroll-Driven Animations gestiscono la transizione fluida nei browser supportati
 *   (timeline-scope: --hero-h1 su body rende il named timeline visibile all'header).
 * → Questo IntersectionObserver aggiunge/rimuove .scrolled come fallback universale
 *   e mantiene il comportamento corretto anche senza CSS SDA.
 * → Solo opacity/visibility cambiano → zero CLS garantito.
 *
 * @module observer
 * @function setupObserver - Setup Intersection Observer per sezioni
 * @function setupHeaderToggle - Toggle skip-link ↔ title-link al scroll
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

    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('nav a[href^="#"]');

    if (sections.length === 0 || navLinks.length === 0) {
      return;
    }

    // Mapper tra ID sezione e href link
    const sectionMap = {};
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        sectionMap[href.slice(1)] = link;
      }
    });

    // Leggi altezza header direttamente dal DOM; fallback a 85px
    const header = document.querySelector(CONFIG.SELECTORS.header);
    const headerHeightPx = (header && header.offsetHeight) || 85;

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        try {
          entries.forEach((entry) => {
            const link = sectionMap[entry.target.id];
            if (!link) return;

            if (entry.isIntersecting) {
              navLinks.forEach(l => l.removeAttribute('aria-current'));
              link.setAttribute('aria-current', 'page');
            } else if (link.getAttribute('aria-current') === 'page') {
              link.removeAttribute('aria-current');
            }
          });
        } catch (error) {
          void error;
        }
      },
      {
        rootMargin: `-${headerHeightPx}px 0px -66% 0px`,
        threshold: CONFIG.OBSERVER_THRESHOLD,
      }
    );

    sections.forEach(section => sectionObserver.observe(section));
  } catch (error) {
    void error;
  }
}

/**
 * Toggle skip-link ↔ title-link when .hero h1 exits/enters the viewport.
 *
 * CSS Scroll-Driven Animations (css/4-header.css) provide a smooth animated
 * transition in supporting browsers; this function adds the .scrolled class
 * as a universal fallback and keeps state in sync everywhere.
 * Only opacity/visibility change → zero CLS.
 *
 * @function setupHeaderToggle
 * @returns {void}
 */
export function setupHeaderToggle() {
  try {
    const h1      = document.querySelector('.hero h1');
    const wrapper = document.querySelector('.header-title-wrapper');
    if (!h1 || !wrapper || !window.IntersectionObserver) return;

    const header  = document.querySelector('header');
    const headerH = (header && header.offsetHeight) || 80;

    new IntersectionObserver(
      ([entry]) => wrapper.classList.toggle('scrolled', !entry.isIntersecting),
      { rootMargin: `-${headerH}px 0px 0px 0px`, threshold: 0 }
    ).observe(h1);
  } catch (error) {
    void error;
  }
}
