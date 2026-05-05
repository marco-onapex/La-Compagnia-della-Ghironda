# La Compagnia della Ghironda

Sito ufficiale della gilda **La Compagnia della Ghironda** per **The Miracle Shard**, uno shard di Ultima Online.

🌐 **Live Site**: https://marco-onapex.github.io/La-Compagnia-della-Ghironda/

---

## Sull'identità di questo repository

Il deliverable funzionale è una pagina statica per una piccola gilda di Ultima Online. **Volutamente** il rigore ingegneristico applicato eccede quello strettamente richiesto dal caso d'uso: il progetto serve anche da reference implementation di un sito statico tenuto a standard "production-grade SaaS" — Level B pure-CSS architecture, 100% per-file coverage + 100% mutation score, CSP strict con SHA-256, supply-chain SHA-pinned, performance budget enforced, multi-browser visual regression, type-checking strict via JSDoc.

Le decisioni architetturali (vedi [ARCHITECTURE.md](ARCHITECTURE.md)) sono motivate sia dal valore tecnico sia dall'intento didattico/portfolio. Quando un trade-off è in conflitto con la semplicità di un sito-vetrina, il repository sceglie consapevolmente la versione più rigorosa e documenta il costo (vedi sezioni "Trade-off documentati" in [CHANGELOG.md](CHANGELOG.md)).

### Architettura font (post-Apr 2026)

Cinque face Cinzel + 1 Crimson, ognuno text-targeted al set di glifi che i selettori CSS effettivamente renderizzano. Sia hero che body renderizzano in Cinzel dal primo paint:

| Face                                | Subset                                                                                        | Critical?                | Preloaded? | Selettori                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------ | ---------- | -------------------------------------------------------------------------------------------- |
| `Cinzel LCP` (subset di Cinzel-700) | hero strings (~38 glifi, <!-- AUTO:FONT_CINZEL_LCP_KB -->4.2<!-- /AUTO --> KB)                | sì — in `<style>` inline | sì         | `.hero h1`, `.hero-subtitle`, `.skip-link-header`, `.header-title`                           |
| `Cinzel` weight 400                 | body text (~66 glifi, <!-- AUTO:FONT_CINZEL_400_KB -->5.6<!-- /AUTO --> KB)                   | sì — in `<style>` inline | sì         | body, `.section p`, `footer p`                                                               |
| `Cinzel` weight 600                 | nav text (~35 glifi, <!-- AUTO:FONT_CINZEL_600_KB -->4.2<!-- /AUTO --> KB)                    | no — in deferred CSS     | no         | `nav a`                                                                                      |
| `Cinzel` weight 700                 | hero + nav + h2/h3 + strong (~46 glifi, <!-- AUTO:FONT_CINZEL_700_KB -->5.0<!-- /AUTO --> KB) | no — in deferred CSS     | no         | `.section h2`, `.section h3`, `.section strong`, `footer strong`, `.header-title-link`, ecc. |
| `Crimson Text` italic 400           | tagline + quote (~46 glifi, <!-- AUTO:FONT_CRIMSON_ITALIC_KB -->10.5<!-- /AUTO --> KB)        | no — in deferred CSS     | no         | `.hero-tagline` (≥1024px), `.quote-liberty`                                                  |

I due face critici (LCP + Cinzel-400) sono dichiarati in critical CSS + preloaded via `<link rel="preload">`: questo garantisce che al primo paint il browser abbia già il woff2 nel `FontFaceSet` ed entri nella finestra di 100 ms di `font-display: optional`. Senza preload + critical, `optional` rifiuterebbe il font dopo il primo paint e il body resterebbe in serif fallback per tutta la sessione.

I tre face deferred (Cinzel-600/700, Crimson italic) caricano post-`load` event tramite il deferred CSS bundle. Su una visita primo-cache su Slow-4G non beat la finestra di 100 ms e nav/sezioni/tagline renderizzano in serif fallback. Visite successive (con woff2 in HTTP cache + SW SWR) li applicano istantaneamente.

Coverage end-to-end:

- **Data layer**: [tests/unit/font-subset-coverage.test.js](tests/unit/font-subset-coverage.test.js) verifica bidirezionalmente che ogni char renderizzato in HTML sia nel subset corrispondente in [scripts/lib/font-text-constants.js](scripts/lib/font-text-constants.js), e viceversa.
- **CSS layer**: [tests/e2e/font-rendering.spec.js](tests/e2e/font-rendering.spec.js) verifica che `body` / `.section p` / `footer p` abbiano computed font-family iniziato da `cinzel`.
- **Console layer**: [tests/e2e/console-clean.spec.js](tests/e2e/console-clean.spec.js) fallisce su qualsiasi `console.warn` / `console.error` durante un page-load completo (cattura regressioni come "Ignored unsupported entryTypes").

Vedi [PERFORMANCE-STRATEGY.md](PERFORMANCE-STRATEGY.md) per la decomposizione delle scelte di critical-path.

---

## 📖 Descrizione

Sito statico ospitato su GitHub Pages che presenta la gilda e la sua storia. La Compagnia della Ghironda è una fratellanza di spiriti liberi dedita alla ricerca, al commercio e alla lotta contro le entità demoniache di Ardania.

Il sito è costruito con:

- **HTML5** semantico
- **CSS3** con Custom Properties e @supports fallback
- **Vanilla JavaScript** senza dipendenze: pure-plumbing (deferred CSS loader + Web Vitals + Service Worker). Tutta la grafica è CSS dichiarativa (`:has()`, `view-timeline`, `scroll-timeline`).

---

## 🏗️ Struttura del Progetto

Round 20 (option B production-grade) separa rigidamente sorgente e artefatto. Il branch `main` contiene solo sorgente; il branch `gh-pages` (orphan) contiene solo l'artefatto deployato. Vedi sezione "Source / Deploy Separation" più sotto.

```
La-Compagnia-della-Ghironda/   ← branch `main` (source-only, committed)
├── index.html                 # Homepage template (placeholder per CSP, CSS:BEGIN/END, no ?v=)
├── sw.js                      # Service Worker template (CACHE_NAME = 'ghironda-PLACEHOLDER')
├── css/                       # Moduli CSS sorgente
│   ├── fonts.css              # Critical @font-face: 'Cinzel LCP' + Cinzel-400
│   ├── fonts-deferred.css     # Deferred @font-face: Cinzel-600/700 + Crimson Text italic
│   ├── 1-variables.css        # Design tokens
│   ├── 2-reset.css            # CSS reset + accessibilità
│   ├── 3-typography.css       # Tipografia (deferred)
│   ├── 4-header.css           # Header e navigazione
│   ├── 5-hero.css             # Hero section
│   ├── 6-sections.css         # Sezioni contenuto + footer (deferred)
│   ├── 7-responsive.css       # Media queries
│   ├── 8-print.css            # Stili stampa (deferred)
│   └── 9-decorations.css      # Gradienti decorativi, alone, ring SVG (deferred)
├── js/                        # Moduli JS sorgente (Level B: solo plumbing, zero grafica)
│   ├── main.js                # Entry point (loader CSS deferred + vitals + SW)
│   └── modules/               # logger.js (devWarn), vitals.js (Web Vitals)
├── fonts/                     # woff2/ttf locali (5 subset Cinzel + Crimson italic)
├── images/                    # WebP responsive set, AVIF LCP, PNG fallback, og-card, app icons
├── manifest.webmanifest, robots.txt, humans.txt, sitemap.xml, .well-known/security.txt, LICENSE
├── scripts/                   # Build pipeline + validator + audit + dev-server
│   ├── copy-static-assets.js  # Mirror fonts/images/.well-known/sw.js → .deploy/
│   ├── strip-html-comments.js # Rimuove commenti HTML da .deploy/index.html
│   ├── inject-doc-numbers.js  # Sincronizza marker AUTO nei doc dopo ogni build
│   └── (cache-bust, generate-csp, update-sitemap, ...)
├── tests/                     # Jest unit + Playwright e2e (215 + N suites)
├── .github/workflows/
│   ├── deploy.yml             # main → gh-pages force-push (round 20 deploy)
│   ├── test.yml, ci-cd.yml, release.yml, hotfix.yml, codeql.yml, update-snapshots.yml
└── .deploy/                   ← GITIGNORED. `npm run build` lo crea/aggiorna.
                                  Mai committato su main; pushato come tutto il
                                  contenuto del branch `gh-pages` da deploy.yml.
```

### Source / Deploy Separation (round 20)

|               | `main` branch                                                                                                    | `gh-pages` branch                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Cosa contiene | Solo sorgente (CSS/JS modulari, template HTML/SW con placeholder)                                                | Solo artefatto deployato (HTML stripped + inline critical CSS, JS bundle, asset mirror)           |
| Mutato da     | Devs                                                                                                             | `.github/workflows/deploy.yml` (orphan-commit + force-push)                                       |
| Letto da      | Devs, CI, lint/test                                                                                              | GitHub Pages                                                                                      |
| `dist/`       | NON esiste (gitignored)                                                                                          | Esiste (`/dist/main.min.js?v=hash`, `/dist/style-deferred.min.css`)                               |
| `index.html`  | Pure template con `<!-- CSS:BEGIN --><!-- CSS:END -->` + `'sha256-PLACEHOLDER='` + `dist/main.min.js` (no `?v=`) | Build artefact: `<style>…</style>` inline, hash CSP reali, `?v=hash` cache-bust, commenti rimossi |

Vedi [BUILD.md](BUILD.md) per la pipeline completa e [.github/workflows/deploy.yml](.github/workflows/deploy.yml) per l'implementazione del push.

---

## 📄 Contenuto Pagina

La homepage è composta da:

### Header (Sticky)

- **Logo dinamico**: Appare quando l'H1 dell'hero esce dal viewport (CSS scroll-driven `view-timeline` su `--hero-h1`, zero JS)
- **Navigazione**: 3 link interni (#origine-identita, #obiettivo-organizzazione, #usi-costumi)
- **Sezione attiva evidenziata**: keyframe CSS `view-timeline` per ogni sezione (Chrome 115+ / Firefox 134+ / Safari 26+; older browser graceful → nav non evidenziato ma cliccabile)
- **Skip link**: Accessibilità (#main-content), primo elemento focalizzabile della pagina

### Hero Section

- **H1 grande**: "La Compagnia della Ghironda"
- **Tagline**: "Nel cuore dell'Arcipelago Perduto..."
- **Immagine ghironda**: Priority loading (`fetchpriority="high"`) + srcset WebP responsive + SVG fBm concentrico pre-generato (inline)
- **Subtitle**: "Finché Gira, il Mondo Resta"

### 3 Sezioni Principali

1. **Origine e Identità** (#origine-identita)
   - Chi Siamo
   - Il Nome
   - Lo Spirito

2. **Obiettivo e Organizzazione** (#obiettivo-organizzazione)
   - Gli Obiettivi
   - La Struttura (Krujal)

3. **Usi e Costumi** (#usi-costumi)
   - Apertura e Tolleranza
   - Influenza Samsariana
   - Bottino e Fiamme

### Footer

- Link a The Miracle Shard
- Informazioni gilda

---

## 🎨 Design

### Palette Colore (Tema Fantasy Gipsy)

```css
--color-night: #0f0a1a; /* Sfondo principale */
--color-gold: #9d7e1a; /* Oro gitano */
--color-accent-gold: #d4b896; /* Oro chiaro */
--color-gipsy-red: #a73a3a; /* Rosso cremisi (decorativo) */
--color-gipsy-green: #4a5f2f; /* Verde oliva */
--color-text: #e8e0d4; /* Testo bianco caldo */
```

### Tipografia

- **Display (headings + LCP region)**: Cinzel 700 (preloaded), Cinzel 600 (deferred)
- **Body**: Cinzel 400 (default) + Crimson Text 400 italic per le pull-quote (`.hero-tagline`, `.quote-liberty`)
- **Fallback**: stack `serif` di sistema (font-display: optional)
- **Scale**: clamp() fluida — 9 livelli da 0.75rem a ~2.027rem

### Responsive

- **Mobile-first**: Base styles per 320px+
- **Tablet/laptop stretto**: Media query @media (max-width: 1023px)
- **Phone aggressive**: Media query @media (max-width: 480px)
- **Desktop**: Media query @media (min-width: 1024px) — header inline
- **Smooth scroll**: scroll-behavior: smooth per jump links
- **Fluid Typography**: clamp() per scaling senza media query extra

---

## ⚡ Performance & Features

### Optimizzazioni Implementate ✅

| Feature                          | Implementazione                                                              | Benefit                                     |
| -------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| **Priority Loading**             | `fetchpriority="high"` su hero img                                           | LCP ottimizzato                             |
| **CSS Scroll-Driven Animations** | Header toggle + sezione attiva via `animation-timeline: view()` / `scroll()` | Zero JS per scroll tracking                 |
| **CSS `:has()` state**           | Hamburger menu via checkbox + `:has(.nav-toggle-input:checked)`              | Stato UI senza JS, una sola fonte di verità |
| **CSS Containment**              | `content-visibility: auto` su sezioni                                        | Paint optimization                          |
| **Will-change**                  | Su elementi animated                                                         | GPU acceleration                            |
| **CSS Custom Properties**        | ~<!-- AUTO:CSS_VAR_COUNT -->30<!-- /AUTO --> variabili (1-variables.css)     | DRY, maintainability                        |
| **Inline fBm SVG**               | Pre-generato, zero runtime cost                                              | No JS computation al caricamento            |
| **Responsive WebP srcset**       | 280w–720w + fallback PNG                                                     | 85%+ risparmio bandwidth                    |
| **Self-hosted fonts**            | Cinzel woff2 locale                                                          | No external requests, no FOIT               |

### Browser Support

| Browser | Support | Note            |
| ------- | ------- | --------------- |
| Chrome  | ✅ Full | Last 2 versions |
| Firefox | ✅ Full | Last 2 versions |
| Safari  | ✅ Full | Last 2 versions |
| Edge    | ✅ Full | Chromium-based  |

---

## ♿ Accessibilità (WCAG AAA)

✅ **A11Y Compliance**:

- Semantic HTML (header, nav, main, footer, section)
- aria-label sull'unico controllo non-anchor (la `<label>` del nav-toggle)
- Skip link (#main-content), primo elemento focalizzabile
- Color contrast > 4.5:1 (la maggior parte > 7:1)
- Focus visibile su tutti gli elementi interattivi
- `prefers-reduced-motion` rispettato in tutto il CSS (nessun JS che ignora il media query)
- Navigazione tastiera completa (incluso il checkbox del nav-toggle)
- Nessun JavaScript richiesto per la funzionalità core (Level B: zero JS gestisce grafica)
- Trade-off documentato: `aria-current` non viene scritto sull'anchor attivo (CSS non può scrivere attributi); l'evidenziazione è puramente visiva

**Accessibility Score: 10/10**

---

## 🔒 Security

**Content Security Policy (CSP)** — strict, nessuna `'unsafe-inline'`:

```
default-src   'self'
script-src    'self' 'sha256-<hash>'
style-src     'self' 'sha256-<hash>'
font-src      'self'
img-src       'self' data:
connect-src   'self'
worker-src    'self'
manifest-src  'self'
object-src    'none'
base-uri      'self'
form-action   'none'
```

Sia gli inline `<script>` (incluso JSON-LD) sia gli inline `<style>` sono autorizzati esclusivamente tramite il loro hash SHA-256, ricalcolato automaticamente da `scripts/generate-csp.js` ad ogni `npm run build`. Drift tra hash atteso e contenuto inline = browser refuse, fail-loud.

✅ Nessuno script esterno (no CDN)
✅ SHA-256 hash per ogni inline `<script>` e `<style>` (auto-aggiornato)
✅ Nessun `eval()`, `new Function()`, o esecuzione dinamica
✅ HTTPS enforced da GitHub Pages + HSTS
✅ `rel="noopener noreferrer"` su tutti i link esterni
✅ ESLint security plugins (`eslint-plugin-security`, `eslint-plugin-no-unsanitized`) gate a commit time
✅ CodeQL `security-extended` query suite weekly + on every PR

**Note sui limiti del meta CSP**: `frame-ancestors`, `sandbox`, `report-uri` sono ignorati silenziosamente quando la CSP è veicolata via `<meta http-equiv>`. Devono essere applicati come HTTP header dal deploy host (GH Pages non li espone). Vedi [`SECURITY.md`](SECURITY.md).

---

## 📊 Code Quality

### Documentation

- **HTML**: Commenti per sezioni + spiegazioni sui pattern checkbox-hack/scroll-driven
- **CSS**:
  - 9-layer modular (1-variables → 9-decorations) + fonts.css
  - Variabili JSDoc-style con scopo documentato
  - Performance notes su `@supports` e content-visibility
- **JavaScript**:
  - JSDoc-typed con `@ts-check` su tutti i moduli
  - 4 file totali: `js/main.js` (entry) + `js/modules/{logger,vitals}.js` + `sw.js`
  - Pure-plumbing: nessun JS gestisce grafica (Level B)

### Standards

✅ No linting errors
✅ HTML5 valid
✅ CSS clean
✅ JavaScript pure-plumbing (Level B): deferred-CSS loader + Web Vitals + Service Worker
✅ Error handling solo a confini di sistema (PerformanceObserver, sendBeacon, SW fetch)

### Testing Status

```
Unit Tests:        ~<!-- AUTO:UNIT_TEST_COUNT -->228<!-- /AUTO --> passing across <!-- AUTO:UNIT_SUITE_COUNT -->9<!-- /AUTO --> suites (logger + vitals + main + sw +
                    scripts + font-subset-coverage + docs-lint + inject-doc-numbers)
Coverage:          100% statements/branches/functions/lines (per-file enforced
                    by jest.config.cjs across js/**/*.js + sw.js; sw.js is
                    `require()`-able via dual-mode CJS bootstrap, so jest's
                    standard transform pipeline instruments it directly — no
                    manual babel-plugin-istanbul step needed since the Apr
                    2026 follow-up)
Mutation Testing:  100% (Stryker, break-threshold; mutates js/**/*.js and
                    sw.js. scripts/docs-lint.js was evaluated and kept out
                    — 156 surviving mutants were ~73 % equivalent regex /
                    informational-string mutations; the gate is integration-
                    tested via npm run lint:docs in CI instead)
E2E Tests:         ~<!-- AUTO:E2E_SPEC_COUNT -->63<!-- /AUTO --> specs across chromium / firefox / webkit, plus
                    visual.spec.js when *-linux.png baselines are committed
                    (skipped with prominent job-summary warning otherwise —
                    see TROUBLESHOOTING.md "Visual baselines missing in CI")
Linting:           0 errors / 0 warnings (HTML, CSS, JS, Prettier, docs-lint)
Type-Checking:     tsc --strict on 3 configs (DOM + WebWorker + Node scripts)
```

### Quality Gates

A `npm run lint` cycle runs five linters; together they enforce content + code + reference correctness across 7 surfaces.

| Gate                                                                                                       | Surface                                                                                         | Catches                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `htmlhint`                                                                                                 | `index.html`                                                                                    | malformed HTML, missing alt, etc.                                         |
| `stylelint`                                                                                                | `css/**/*.css`                                                                                  | property typos, max-specificity overflow, ordering                        |
| `eslint` (with `security`, `unicorn`, `no-unsanitized`, `promise`, `import`, `jest`, `playwright` plugins) | `*.js` / `*.cjs` / `*.mjs`                                                                      | XSS / injection patterns, dead code, unused imports, test-pattern misuses |
| `prettier --check`                                                                                         | every text file                                                                                 | format drift                                                              |
| `docs-lint` (`scripts/docs-lint.js`)                                                                       | 12 markdown + 11 config + `index.html` + `manifest.webmanifest` + `dist/style-deferred.min.css` | three integrity layers — see below                                        |

The `docs-lint` gate has three layers (each found at least one real defect during the Apr 2026 follow-up):

1. **Regex layer** — `FORBIDDEN_REFERENCES` (universal: file paths and symbol names removed in past refactors) + `FORBIDDEN_PROSE` (Markdown-only: positive claims about behaviour that is no longer true).
2. **`npm run` layer** — every `npm run <script-name>` token in the markdown corpus must resolve to a script defined in `package.json`.
3. **Asset-reference layer** — every same-origin URL in `index.html` (`<meta>`, `<link>`, `<script>`, `<img>`, `<source srcset>`, JSON-LD `"logo"/"image"`), every `manifest.webmanifest icons[].src`, and every `url(...)` in inline `<style>` blocks AND in `dist/style-deferred.min.css` must resolve to a tracked file in git.

### Accessibility Status ✅

```
WCAG Level:        AAA target (axe color-contrast-enhanced)
Axe Violations:    0
Touch Targets:     >= 44 × 44 px on every interactive element (WCAG 2.5.5 AAA)
Reduced Motion:    Honoured in CSS (no JS bypass; pure-CSS animations)
```

### Security Status ✅

```
Content Security Policy:   strict — SHA-256 hashes for every inline <script>/<style>
style-src:                 'self' + sha256 hash (no 'unsafe-inline')
script-src:                'self' + sha256 hash (no 'unsafe-inline', no remote CDN)
worker-src:                'self' (explicit, for the registered service worker)
XSS Protection:            full (no eval, no inline event handlers, no dynamic scripts)
HTTPS:                     enforced (GitHub Pages + HSTS)
Supply chain:              all GitHub Actions SHA-pinned, Dependabot grouped updates
```

---

## 📈 Metriche misurabili

Self-assessed scores were removed: a number like "9.5/10 Verified" without
an external rubric is marketing, not evidence. The metrics below are
either machine-generated by CI (link to artifact) or computed from a
checked-in script.

| Metrica                     | Sorgente                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lighthouse Desktop          | `npm run audit:lighthouse:desktop` (target: 100/100/100/100)                                                                                                                                      |
| Lighthouse Mobile           | `npm run audit:lighthouse:mobile` (target: ≥98 perf, 100 rest)                                                                                                                                    |
| Bundle gzip                 | `npm run audit:performance` (budget JS≤<!-- AUTO:BUDGET_JS_MAX -->3<!-- /AUTO -->KB / CSS≤<!-- AUTO:BUDGET_CSS_MAX -->7.5<!-- /AUTO -->KB / Tot≤<!-- AUTO:BUDGET_TOTAL_MAX -->10<!-- /AUTO -->KB) |
| Unit + e2e + mutation gates | `.github/workflows/test.yml` (per-PR artifact)                                                                                                                                                    |
| WCAG AA + AAA contrast      | `tests/e2e/accessibility.spec.js` (axe-core, WCAG 2.0/2.1/2.2)                                                                                                                                    |
| Visual regression           | `tests/e2e/visual.spec.js` (1% pixel-diff threshold)                                                                                                                                              |

---

## 🔧 Customizzazione

### Modificare Colori

Edita `css/1-variables.css` nella sezione `:root`:

```css
:root {
  --color-night: #0f0a1a; /* Cambio colore sfondo */
  --color-gold: #9d7e1a; /* Cambio colore primario */
  --color-gipsy-red: #a73a3a; /* Cambio colore accent */
  /* ... altre variabili (~30 total in 1-variables.css) */
}
```

Poi rebuilda con `npm run build:css`.

### Modificare Testo

Edita i `<p>`, `<h2>`, `<h3>` in `index.html` nelle rispettive sezioni:

- **Origine e Identità**: Sezione 1 (#origine-identita)
- **Obiettivo e Organizzazione**: Sezione 2 (#obiettivo-organizzazione)
- **Usi e Costumi**: Sezione 3 (#usi-costumi)

### Aggiungere Immagini

1. Salva immagine in `images/`
2. Referenzia in HTML: `<img src="images/nome.png" alt="descrizione" loading="lazy" decoding="async">`
3. Commit e push

### Aggiungere Sezioni

1. Aggiungi `<section class="section" id="id-sezione">` in `index.html` dentro `<main>`
2. Aggiungi link in `<nav>` con `<a href="#id-sezione">Titolo</a>`
3. Styling è automatico (`.section` applica stile)

---

## 📦 Deploy

Round 20 (option B production-grade): il deploy è automatico via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Push a `main` → CI verde → workflow esegue `npm run build` → force-push del contenuto di `.deploy/` come orphan-commit sul branch `gh-pages`. GitHub Pages serve da `gh-pages`.

### Setup iniziale (una sola volta per repo)

1. **Abilita Pages**:
   - Settings → Pages
   - Source: **Deploy from a branch**
   - Branch: **`gh-pages`** (NON `main` — `main` contiene solo sorgente, non l'artefatto)
   - Folder: `/ (root)`
   - Salva

2. **Branch protection raccomandata** per `gh-pages`:
   - Settings → Branches → Add rule per `gh-pages`
   - Restrict deletions, restrict force-push tranne via GitHub Actions (`github-actions[bot]`)
   - NON richiedere PR review (il branch è generato dal workflow, non hand-edited)

### Deploy in produzione

```bash
git add .
git commit -m "feat: descrizione del cambio"
git push origin main
```

Il push triggera in sequenza:

1. `test.yml` (lint + unit + e2e + build + lighthouse) — ~5-7 min
2. `ci-cd.yml` (SEO + security audit + bundle integrity) — ~3 min
3. `deploy.yml` — costruisce e pusha `.deploy/` su `gh-pages` (richiede `test.yml` verde via `workflow_run`)
4. Pages rebuild automatico — ~1 min

**Sito live**: https://marco-onapex.github.io/La-Compagnia-della-Ghironda/

### Rollback di un deploy

Il branch `gh-pages` è orphan (ogni deploy è root-commit nuovo) — `git revert` non è applicabile. Rollback:

```bash
# Identifica lo SHA di main su cui era basato il deploy precedente, poi:
gh workflow run deploy.yml --ref <good-sha>
```

In alternativa, revertire la commit problematica su `main` e pushare — il deploy automatico ripubblica lo stato sano.

---

## 📚 Stack Tecnologico

| Categoria       | Tecnologia                                 | Note                                                                                                                                                                                      |
| --------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HTML**        | HTML5                                      | Semantic markup, skip link, schema.org `@graph`, hreflang                                                                                                                                 |
| **CSS**         | CSS3                                       | Custom Properties (~<!-- AUTO:CSS_VAR_COUNT -->30<!-- /AUTO -->), modular (10 files: 8 layers + fonts + decorations)                                                                      |
| **JavaScript**  | Vanilla ES2022                             | Zero runtime dependencies; ~<!-- AUTO:JS_GZIP -->1.2<!-- /AUTO --> KB gzip; pure-CSS architecture (Level B) — JS gestisce solo deferred-CSS loader, Web Vitals, SW                        |
| **Testing**     | Jest + Playwright + Stryker                | ~<!-- AUTO:UNIT_TEST_COUNT -->228<!-- /AUTO --> unit + ~<!-- AUTO:E2E_SPEC_COUNT -->63<!-- /AUTO --> e2e specs (chromium / firefox / webkit) + Stryker 100/100 mutation score, 100% gates |
| **Type-check**  | TypeScript 6 (`tsc --strict`, JSDoc)       | DOM + WebWorker scopes (`tsconfig.json` + `tsconfig.sw.json`)                                                                                                                             |
| **Fonts**       | Self-hosted woff2                          | Cinzel 600/700 + Crimson Text 400 italic — no external requests                                                                                                                           |
| **Linting**     | ESLint 9 + Stylelint + HTMLHint + Prettier | 0 errors / 0 warnings, flat config, security plugins, format-check enforced                                                                                                               |
| **Build**       | esbuild + Node 24                          | parallel CSS/JS minify, composite-hash cache-bust, auto-CSP (SHA-256 hashes)                                                                                                              |
| **Service Wkr** | NetworkFirst HTML + SWR static             | content-type policy, AbortController timeout, offline shell                                                                                                                               |
| **Hosting**     | GitHub Pages                               | HTTPS-only via HSTS                                                                                                                                                                       |
| **VCS**         | Git + Husky 9 hooks + commitlint           | Pre-commit lint-staged, pre-push test:fast, conventional commits                                                                                                                          |

---

## Testing & Quality Assurance

### Run All Tests

```bash
npm run test              # Unit tests + linting
npm run test:fast        # Fast test mode (2 workers, fail-fast)
npm run test:all         # Unit + E2E + linting
npm run test:ci          # CI/CD mode (all checks)
```

### Run Linting

```bash
npm run lint             # All linters (sequential)
npm run lint:parallel    # All linters (parallel, faster)
```

### Development Server

```bash
npm run check            # Pulisce dist/ ed esegue test rapidi (lint + unit)
npm run prod             # Full validation before production
```

---

## 📋 Checklist: Production Readiness

- [x] Unit tests passing (~<!-- AUTO:UNIT_TEST_COUNT -->228<!-- /AUTO -->/<!-- AUTO:UNIT_TEST_COUNT -->228<!-- /AUTO -->), 100% coverage per-file
- [x] Mutation tests passing (Stryker, 100% break-threshold)
- [x] E2E tests passing (~<!-- AUTO:E2E_SPEC_COUNT -->63<!-- /AUTO --> specs) across chromium / firefox / webkit
- [x] All linters + Prettier passing (0 errors / 0 warnings)
- [x] Type-checking passing (tsc --strict over JS via JSDoc)
- [x] Accessibility verified (WCAG AAA, axe color-contrast-enhanced, no violations)
- [x] Security hardened (strict CSP — SHA-256 hashes, no unsafe-inline)
- [x] Performance under budget (~<!-- AUTO:TOTAL_RAW -->24.5<!-- /AUTO --> KB uncompressed, ~<!-- AUTO:TOTAL_GZIP -->7.1<!-- /AUTO --> KB gzip)
- [x] Browser compatibility confirmed (Chrome / Firefox / Safari / Edge via Playwright)
- [x] Documentation complete + LICENSE + SECURITY.md + CONTRIBUTING.md + CODE_OF_CONDUCT.md
- [x] Service worker hardened (NetworkFirst HTML, content-type validation)
- [x] Supply chain hardened (Actions SHA-pinned, Dependabot grouped, CodeQL)
- [x] Ready for production deployment ✅

---

## 🎯 Features Implementate

✅ Header dinamico (CSS scroll-driven `view-timeline` su `.hero h1` — zero JS)
✅ Scroll to top (header title click → href="#")
✅ Sezione attiva evidenziata (CSS `view-timeline` per sezione, `@supports`-gated)
✅ SVG fBm concentrico pre-generato (inline, zero runtime cost)
✅ Responsive WebP srcset (280w–720w, 85%+ risparmio)
✅ Priority loading hero image (`fetchpriority="high"`)
✅ Self-hosted fonts (nessuna richiesta esterna)
✅ Mobile-first responsive design
✅ prefers-reduced-motion support
✅ CSP security headers
✅ WCAG AAA accessibilità
✅ Semantic HTML
✅ robots.txt & sitemap.xml

---

## 🔗 Link Importanti

- **The Miracle Shard**: https://www.themiracleshard.com
- **Ultima Online**: https://www.uo.com
- **GitHub Repository**: https://github.com/marco-onapex/La-Compagnia-della-Ghironda
- **Live Demo**: https://marco-onapex.github.io/La-Compagnia-della-Ghironda/

---

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

## ⚖️ Licenza

Contenuti originali dedicati alla comunità di **The Miracle Shard**. Stile visivo e codice disponibili per reference e learning.

---

**La Compagnia della Ghironda** | The Miracle Shard - Shard di Ultima Online
