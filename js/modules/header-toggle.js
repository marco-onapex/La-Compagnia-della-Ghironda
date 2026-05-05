/**
 * Skip-link ↔ title-link cross-fade — fallback path for browsers
 * that do NOT support `animation-timeline: view()`.
 *
 * The April 2026 Pure-CSS refactor (Level B) replaced a JS scroll
 * listener with a CSS scroll-driven animation
 * (`@supports (animation-timeline: view())` in css/4-header.css).
 * On engines that ship that feature — Chrome ≥115, Firefox ≥134,
 * Safari ≥26 — every visual aspect of the swap (cross-fade, focus
 * order via pointer-events / visibility) is owned by CSS keyframes
 * keyed off a named view-timeline; no JS runs.
 *
 * On older engines (Safari ≤25, legacy Chromium / Firefox builds,
 * any browser surfaced via WebView shells that haven't caught up
 * yet) the keyframes never fire and the skip-link stays permanently
 * visible — the documented "swap on scroll" affordance is silently
 * lost. Round-23 follow-up restores it via this module.
 *
 * Strategy: a single IntersectionObserver on the hero <h1>. When the
 * h1 leaves the viewport, set `body.is-scrolled-past-hero`; when it
 * re-enters (scroll-to-top), clear it. The matching CSS rule lives
 * in css/4-header.css OUTSIDE the `@supports (animation-timeline)`
 * block, so the two paths are mutually exclusive — the modern path
 * runs the keyframe, the fallback path reads the body class. No
 * double-animation, no flicker.
 *
 * Cost on modern browsers: ZERO. The first line bails out before
 * any DOM query, allocation, or observer is created. The cost only
 * materialises on the engines that actually need the fallback.
 *
 * @module header-toggle
 * @function setupHeaderToggle
 */

/* `body.is-scrolled-past-hero` is the single piece of JS-driven
   graphical state in the codebase. Every other visual rule is CSS-
   native (Pure CSS Level B). The exception is documented in
   ARCHITECTURE.md and is the price of supporting browsers older than
   the animation-timeline shipping cutoff. */
const SCROLLED_PAST_HERO_CLASS = 'is-scrolled-past-hero';

/**
 * Attach the fallback observer if (and only if) the current engine
 * lacks CSS scroll-driven animation support. No-op otherwise.
 *
 * @returns {void}
 */
export function setupHeaderToggle() {
  /* Feature gate: when CSS owns the animation, JS must stay out of
     the way. `CSS.supports('animation-timeline: view()')` is the
     identical query the @supports block in 4-header.css uses, so
     the two paths can never both be live at once. */
  if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timeline: view()')) {
    return;
  }

  /* IntersectionObserver shipped in every browser old enough to
     also lack animation-timeline (Safari 12+, Chrome 51+, Firefox
     55+). The defensive guard here is for jsdom and any non-DOM
     test environment that doesn't ship the constructor. */
  if (typeof IntersectionObserver === 'undefined') {
    return;
  }

  const heroH1 = document.querySelector('.hero h1');
  if (!heroH1) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      document.body.classList.toggle(SCROLLED_PAST_HERO_CLASS, !entry.isIntersecting);
    },
    /* threshold: 0 — fire as soon as the h1 crosses any viewport
       edge. The hero h1 is well above the fold, so the only edge
       that matters in practice is the top: when the user has
       scrolled past the entire hero, the h1 is no longer
       intersecting and the fallback class flips on. */
    { threshold: 0 },
  );
  observer.observe(heroH1);
}
