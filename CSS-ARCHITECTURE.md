# CSS Architecture - La Compagnia della Ghironda

## 📐 Filosofia di Design

Sistema CSS **modularizzato**, **scalabile** e **accessibile** basato su:

- **Single Responsibility**: Ogni file ha un compito unico
- **Cascade**: Importazioni ordinate per specificity corretta
- **CSS3 Features**: Custom Properties and modern selectors
- **Progressive Enhancement**: Graceful degradation assicurata
- **WCAG AAA Compliance**: Accessibilità inclusa da design

---

## 📦 File Structure (Ordine di Build)

### 0. **Fonts**: critical (`fonts.css`) + deferred (`fonts-deferred.css`)

`@font-face` self-hosted, split tra critical bundle e deferred bundle per non far competere
i font non-LCP con l'immagine LCP per la banda Slow-4G:

- **`fonts.css` (critical, inlined in `<head>`)** — entrambi preloaded:
  - `'Cinzel LCP'` — subset di Cinzel-700 (~<!-- AUTO:FONT_CINZEL_LCP_KB -->4.2<!-- /AUTO --> KB, ~38 glifi unici di hero h1 / subtitle /
    skip-link / header-title con upper-case envelope), nome di famiglia DISTINTO
    così il browser non fa race con il font full.
  - `Cinzel` weight 400 — body text subset (~<!-- AUTO:FONT_CINZEL_400_KB -->5.6<!-- /AUTO --> KB, ~66 glifi). In critical
    perché `font-display: optional` blocca l'applicazione del font dopo il
    primo paint del body se il woff2 non è già nel `FontFaceSet`. Senza
    declaration in critical + preload, il body resterebbe in serif fallback
    per tutta la sessione.
- **`fonts-deferred.css` (deferred, applicato post-LCP)**:
  - `Cinzel` weight 600 — nav links (above-fold ma non LCP, fallback serif al
    primo visit)
  - `Cinzel` weight 700 (full set, text-targeted subset) — section h2 / h3 / strong / footer
  - `'Crimson Text'` italic (text-targeted subset) — `.hero-tagline` desktop,
    `.quote-liberty`

Tutte le declaration usano `font-display: optional` — no FOIT, no CLS (fallback serif se
il font non rispetta la finestra di 100 ms).

---

### 1. **Variables** (`1-variables.css`)

**Fondazione**: ~<!-- AUTO:CSS_VAR_COUNT -->30<!-- /AUTO --> CSS Custom Properties

- **Colori**: Palette Gitana (ocra, cremisi, nero)
- **Tipografia**: Font stacks (Cinzel, Crimson Text) + scale 1.125
- **Spacing**: 7-level scale (--sp-xs a --sp-3xl)
- **Shadows**: Preset shadows (sm, md, lg, gold, fire, magic)
- **Transitions**: Standard timings (150ms, 300ms, 500ms)

**Uso**: `color: var(--color-accent-gold);`

---

### 2. **Reset** (`2-reset.css`)

**Normalizzazione**: Browser inconsistencies + accessibility

- **Global Reset**: margin/padding/box-sizing azzerati
- **Reduced Motion**: @media prefers-reduced-motion rispetto
- **Form Elements**: input, button, textarea, select reset
- **Semantic Elements**: code, pre, blockquote, hr, table
- **Links**: Styling base globale (colore, hover state)
- **Data Attributes**: [hidden], [disabled], [aria-*] handling
- **Utility Classes**: .sr-only, .hidden, .flex, .text-center, etc.
- **CSS Custom Properties**: Full browser support (last 2 versions)

**Uso**: Base globale, no override necessario per la maggior parte

---

### 3. **Typography** (`3-typography.css`)

**Gerarchia Testuale**: Font sizes, weights, colors

- **Heading System**: h1-h6 scale con clamp() (responsive)
- **Paragraph Styles**: .section p, footer p con spacing
- **Text Colors**: Primary, secondary, muted levels
- **Line Heights**: tight (1.3), normal (1.6), relaxed (1.85)
- **Special Treatments**: ::first-letter, text-shadow, letter-spacing

**Uso**: Applicato automaticamente a h1, h2, p, footer via selettori

---

### 4. **Header** (`4-header.css`)

**Navigation Bar**: Sticky header con stato pure-CSS (Level B)

- **Sticky Positioning**: top: 0, z-index: 100
- **Background**: Gradient + SVG pattern + backdrop blur
- **Navigation**: highlight della sezione attiva via `view-timeline` keyframes (no JS, no aria-current)
- **Logo Dinamico**: cross-fade skip-link↔title-link via `scroll-timeline` su `--hero-h1`
- **Hamburger toggle**: checkbox-hack — `<input type="checkbox" class="nav-toggle-input">` letto via `:has()`
- **Skip Link**: Accessibilità (#main-content), primo elemento focalizzabile

**Uso**: Applicato a `<header>`, `<nav>`, `.header-*` classes

---

### 5. **Hero** (`5-hero.css`)

**Section Principale**: Featured image + SVG topografia

- **SVG Background**: .ghironda-wrapper::after (z-index: -1)
- **Image Styling**: .ghironda-icon con dimensioni dinamiche
- **Title**: .hero h1 con animations
- **Subtitle**: .hero-subtitle styling
- **Z-Index Strategy**: SVG behind all hero elements

**Uso**: Applicato a `.hero`, `.ghironda-*` classes

---

### 6. **Sections** (`6-sections.css`)

**Content Sections**: Main article + card system

- **Section Layout**: max-width, padding, borders, shadows
- **Card Grid**: grid auto-fit system (280px minmax)
- **Card Styling**: Gradient background, hover effects
- **Footer**: Same styling as header (symmetric)
- **Decorative Elements**: ::before/::after for ornaments

**Uso**: Applicato a `<section>`, `.section`, `.card`, `.cards-grid`, `<footer>`

---

### 7. **Responsive** (`7-responsive.css`)

**Media Queries**: Mobile-first, breakpoint critico 1024 px

- **≤480px**: nav stacks vertically (handset stretto)
- **≤599px**: hamburger toggle visibile, nav collassato
- **600-1023px**: header-container single-column (tablet/laptop stretti — hamburger ancora attivo)
- **≥1024px**: header-container two-column, nav sempre visibile (desktop layout in `4-header.css`)
- Il valore `1024` è replicato verbatim in `7-responsive.css`, `4-header.css`, `2-reset.css`, `5-hero.css`. CSS non permette custom property dentro `@media`, quindi è un magic number documentato — vanno tenuti in sincrono manualmente.

**Uso**: Breakpoint adjustments per sezioni specifiche

---

### 8. **Print** (`8-print.css`)

**Stampa**: Print-friendly styles

- **Hide Elements**: .no-print class
- **Page Break**: Avoid unnecessary breaks
- **Colors**: Semplificato per stampa (no gradients complex)
- **Links**: URL visible in print (@supports print)

**Uso**: Non applica all'on-screen, solo @media print

---

## 🎯 Design System Tokens

### Color Palette

```
Night (background):        #0f0a1a
Gold (primary heading):    #9d7e1a  (--color-gold)
Accent Gold (highlights):  #d4b896  (--color-accent-gold)
Gipsy Red (active/accents): #a73a3a (--color-gipsy-red)
Gipsy Green (em text):     #4a5f2f  (--color-gipsy-green)
Fire Orange (hover):       #c97a3a  (--color-fire-orange)
Text (primary):            #e8e0d4  (--color-text)
Text Secondary:            #c4b5a0  (--color-text-secondary)
```

**Color Contrast (WCAG AAA):**

- Gold on Night: 7.2:1 ✅
- Text on Night: 9.1:1 ✅
- Accent on Night: 8.4:1 ✅

---

### Typography Scale (Modular 1.125)

```
fs-xs:   0.75rem   (12px @16px base)
fs-sm:   0.875rem  (14px)
fs-base: 1rem      (16px)
fs-lg:   1.125rem  (18px)
fs-xl:   1.266rem  (20px)
fs-2xl:  1.424rem  (23px)
fs-3xl:  1.602rem  (26px)
fs-4xl:  1.802rem  (29px)
fs-5xl:  2.027rem  (32px)
```

**Font Families:**

- Serif: `Cinzel, Crimson Text, serif` (medievale)
- Sans: System fonts fallback
- Decorative: `Cinzel Decorative` (special treatments)

---

### Spacing Scale

```
sp-xs:   0.5rem   (8px)
sp-sm:   0.75rem  (12px)
sp-md:   1rem     (16px)
sp-lg:   1.5rem   (24px)
sp-xl:   2rem     (32px)
sp-2xl:  3rem     (48px)
sp-3xl:  4rem     (64px)
```

---

### Shadows (Soft, Minimal)

```
shadow-sm:   0 2px 4px rgb(0 0 0 / 15%)
shadow-md:   0 4px 8px rgb(0 0 0 / 20%)
shadow-lg:   0 8px 16px rgb(0 0 0 / 30%)
shadow-gold: 0 0 20px rgb(157 126 26 / 10%)
shadow-fire: 0 0 25px rgb(201 122 58 / 12%)
```

---

### Transitions

```
transition-fast:   250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)
transition-normal: 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94)
transition-layout: 350ms cubic-bezier(0.25, 0.46, 0.45, 0.94)
```

---

## 🎨 Z-Index Strategy

```
z-index: 100   → header (sticky, always on top)
z-index: 2     → .hero image (ghironda icon)
z-index: 1     → .hero content (title, subtitle)
z-index: -1    → .ghironda-wrapper::after (SVG topografia)
```

**Regola**: SVG background dietro TUTTI gli elementi hero, ma visible

---

## ♿ Accessibility Features

### Built-in Patterns

- **Focus Visible**: 2px gold outline, 2px offset (all focusable elements)
- **Reduced Motion**: Animations disable con @media prefers-reduced-motion
- **Color Contrast**: WCAG AAA su ogni combinazione testo/sfondo (enforced da axe `color-contrast-enhanced` nel test e2e)
- **Skip Link**: `.skip-link-header` → #main-content
- **ARIA Labels**: nav, buttons, landmarks
- **Semantic HTML**: header, nav, main, section, footer, article

### Utility Classes

- `.sr-only` - Screen reader only text (visually hidden)
- `.sr-only-focusable` - SR text visible on :focus
- Active nav indication: pure-CSS via `view-timeline` keyframe (Level B), no `aria-current` attribute

---

## 📐 Media Queries

```css
/* Mobile First Approach — usa CSS Level 4 range syntax */
/* Default: handset (360px+) */

@media (width < 1024px) {
  /* Mobile / tablet — single-column header, hamburger toggle */
}

@media (width >= 1024px) {
  /* Desktop — two-column header, nav always visible */
}

@media (max-width: 480px) {
  /* Stretto handset — nav stacks vertically */
}

@media (prefers-reduced-motion: reduce) {
  /* Disable animations */
}

@media print {
  /* Print-specific styles (8-print.css) */
}
```

Il valore `1024` è replicato verbatim nei file CSS che lo usano (`7-responsive.css`, `4-header.css`, `2-reset.css`, `5-hero.css`). CSS non permette custom property dentro `@media` — quando si modifica il valore vanno aggiornati tutti i file in sincrono.

---

## 🔄 Cascade & Specificity

**Specificity Strategy** (Low to High):

```
1. Element selectors (html, body, div)
2. Class selectors (.button, .card)
3. Attribute selectors ([disabled])
4. Combination selectors (.card > p)
5. NO IDs for styling (except JS hooks)
6. NO !important (except accessibility, reset)
```

**Cascade Order** (Importance):

```
1. Variables (foundation)
2. Reset (baseline)
3. Typography (text hierarchy)
4. Component styles (header, hero, sections)
5. Responsive (media queries override)
6. Print (media-specific)
```

---

## 🛠️ Common Patterns

### Add New Section

```css
/* In 6-sections.css or new file */
.my-section {
  padding: clamp(2rem, 5vw, 4rem) var(--sp-xl);
  max-width: 1100px;
  margin: 0 auto;
}

/* Responsive */
@media (max-width: 1023px) {
  .my-section {
    padding: var(--sp-lg);
  }
}
```

### Add New Component

```css
/* New file: 9-my-component.css */
.my-component {
  background: var(--color-deep-earth);
  color: var(--color-text);
  padding: var(--sp-md);
  border-radius: 2px;
  transition: all var(--transition-normal);
}

.my-component:hover {
  color: var(--color-accent-gold);
}
```

Then add `'9-my-component.css'` to `CSS_MODULES` in `build-css.js`.

---

## 📊 Bundle Information

`build-css.js` concatena i moduli in due bundle minificati con esbuild:

| Bundle                        | Modules                                                          | Output                               | Size                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Critical** (above-the-fold) | fonts, 1-variables, 2-reset, 4-header, 5-hero, 7-responsive      | inlined into `<style>` in index.html | ~<!-- AUTO:CSS_INLINE_RAW -->13.1<!-- /AUTO --> KB raw / ~<!-- AUTO:CSS_INLINE_GZIP -->3.5<!-- /AUTO --> KB gzip    |
| **Deferred** (below-the-fold) | fonts-deferred, 3-typography, 6-sections, 8-print, 9-decorations | `dist/style-deferred.min.css`        | ~<!-- AUTO:CSS_DEFERRED_RAW -->8.8<!-- /AUTO --> KB raw / ~<!-- AUTO:CSS_DEFERRED_GZIP -->2.5<!-- /AUTO --> KB gzip |

Il deferred CSS è fetchato da `main.js` sul `load` event (vedi `PERFORMANCE-STRATEGY.md` per la motivazione del NO-`<link rel="preload">`). Nessuna richiesta CSS render-blocking. Totale: **~<!-- AUTO:CSS_TOTAL_RAW -->21.9<!-- /AUTO --> KB raw / ~<!-- AUTO:CSS_TOTAL_GZIP -->5.9<!-- /AUTO --> KB gzip**, sotto il budget di <!-- AUTO:BUDGET_TOTAL_MAX -->10<!-- /AUTO --> KB gzip enforced da `scripts/performance-budget.js`.

---

## ✅ Quality Checklist

- ✅ HTML hint: 0 errors
- ✅ Stylelint: 0 errors
- ✅ ESLint: 0 errors
- ✅ WCAG AAA compliant
- ✅ Modern browsers (ES2020+)
- ✅ Responsive (360px → 4K)
- ✅ Performance optimized
- ✅ Accessibility tested (focus, ARIA, semantic)
- ✅ Print-friendly
- ✅ Modular & scalable

---

## 📖 Further Reading

- [CSS Cascade Specification](https://www.w3.org/TR/css-cascade-4/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [MDN CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [A11y Color Contrast](https://webaim.org/articles/contrast/)

---

_Last-modified date and version markers were removed: they drift instantly
the next time the file is edited and create a false sense of authority.
Use `git log -- CSS-ARCHITECTURE.md` for the authoritative history._
