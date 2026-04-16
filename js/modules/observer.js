/**
 * JavaScript Modules - Intersection Observer
 *
 * Monitora le sezioni attive per navigazione aria-current:
 * → Traccia quale sezione è visibile nel viewport
 * → Aggiorna aria-current="page" sul link di navigazione corrispondente
 *
 * setupHeaderToggle: toggle skip-link ↔ title-link nell'header.
 * → CSS Scroll-Driven Animations gestiscono la transizione fluida nei browser supportati.
 * → Questo IntersectionObserver aggiunge/rimuove .scrolled come fallback universale.
 * → Solo opacity/visibility cambiano → zero CLS garantito.
 *
 * setupNavToggle: hamburger menu su mobile.
 * → Toggling header.nav-open espande/collassa il nav.
 * → Aggiorna --header-h dopo ogni transizione per mantenere corretto scroll-padding e hero height.
 *
 * setupHeaderHeight: ResizeObserver sul header.
 * → Aggiorna --header-h in tempo reale ogni volta che il header cambia altezza.
 *
 * @module observer
 * @function setupObserver       - Intersection Observer per sezioni aria-current
 * @function setupHeaderToggle   - Toggle skip-link ↔ title-link al scroll
 * @function setupNavToggle      - Hamburger menu expand/collapse
 * @function setupHeaderHeight   - ResizeObserver per --header-h dinamico
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

/* ─── Shared helper: aggiorna --header-h sul root ────────────────────────── */
function applyHeaderH(header) {
  if (header) {
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  }
}

/**
 * Hamburger menu expand/collapse for mobile.
 *
 * Toggles header.nav-open — CSS animates the nav via grid-template-rows 0fr→1fr.
 * After each animation, --header-h is updated so scroll-padding and the hero
 * viewport height remain correct.
 * Clicking a nav link while the menu is open also collapses it automatically.
 *
 * @function setupNavToggle
 * @returns {void}
 */
export function setupNavToggle() {
  try {
    const toggle = document.querySelector('.nav-toggle');
    const nav    = document.getElementById('main-nav');
    const header = document.querySelector('header');
    if (!toggle || !nav || !header) return;

    const NAV_ANIM_MS = 300; // matches CSS transition duration (0.28s + buffer)

    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));
      header.classList.toggle('nav-open', !isOpen);
      // Update after animation so the final header height is captured
      setTimeout(() => applyHeaderH(header), NAV_ANIM_MS);
    });

    // Collapse nav when a link is clicked (user navigates to a section).
    // When the nav is open on mobile, --header-h reflects the expanded header (title
    // + nav rows). If the browser scrolls immediately it uses that inflated value for
    // scroll-padding-top, then the nav closes and the header shrinks → section ends
    // up hidden under the shrunken header.
    // Fix: intercept anchor clicks while the nav is open → close nav first → wait for
    // the animation to finish → read the collapsed header height → manually scroll to
    // (section's absolute page position) - (collapsed header height).
    // window.scrollTo avoids any dependency on scroll-padding / scroll-margin CSS.
    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        const isAnchor = href && href.startsWith('#') && href.length > 1;

        if (isAnchor && header.classList.contains('nav-open')) {
          // Prevent the browser from scrolling with the stale (open) header height.
          e.preventDefault();
          toggle.setAttribute('aria-expanded', 'false');
          header.classList.remove('nav-open');
          // After animation: header is at its final collapsed height. getBoundingClientRect()
          // forces a layout flush so we read positions after the hero has resized too.
          setTimeout(() => {
            applyHeaderH(header);
            const target = document.getElementById(href.slice(1));
            if (target) {
              // target's absolute position in the page - collapsed header height
              const top = target.getBoundingClientRect().top + window.scrollY - header.offsetHeight;
              window.scrollTo({ top, behavior: 'smooth' });
              if (window.history?.pushState) window.history.pushState(null, '', href);
            }
          }, NAV_ANIM_MS);
        } else {
          toggle.setAttribute('aria-expanded', 'false');
          header.classList.remove('nav-open');
          setTimeout(() => applyHeaderH(header), NAV_ANIM_MS);
        }
      });
    });

    // Collapse nav on resize to desktop so it's always clean if user resizes.
    // Debounced at 150ms: resize fires on every pixel during drag/rotation —
    // without debouncing it causes repeated layout reads (offsetHeight) and
    // classList mutations at up to 60fps.
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.innerWidth >= 769 && header.classList.contains('nav-open')) {
          toggle.setAttribute('aria-expanded', 'false');
          header.classList.remove('nav-open');
          applyHeaderH(header);
        }
      }, 150);
    }, { passive: true });
  } catch (error) {
    void error;
  }
}

/**
 * ResizeObserver on the header: keeps --header-h accurate whenever the header
 * changes height (font load, nav expand/collapse, viewport resize).
 *
 * @function setupHeaderHeight
 * @returns {void}
 */
export function setupHeaderHeight() {
  try {
    const header = document.querySelector('header');
    if (!header || !window.ResizeObserver) return;

    new ResizeObserver(() => applyHeaderH(header)).observe(header);
  } catch (error) {
    void error;
  }
}
