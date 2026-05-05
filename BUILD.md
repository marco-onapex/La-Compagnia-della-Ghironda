# Build Pipeline

## Source / Deploy Separation (round 20, option B production-grade)

`main` branch holds **source only**. The deployable artefact lives
under `.deploy/` (gitignored on `main`) and is force-pushed to the
orphan `gh-pages` branch by `.github/workflows/deploy.yml` on every
push to `main`. GitHub Pages serves from `gh-pages`.

What this means in practice:

- `index.html`, `sw.js` on `main` are pure templates: empty
  `<!-- CSS:BEGIN --><!-- CSS:END -->` placeholder, no `?v=...`
  cache-bust query, `'sha256-PLACEHOLDER='` in CSP, `CACHE_NAME =
'ghironda-PLACEHOLDER'` in the SW. The build chain materialises real
  values into `.deploy/` copies; source is never mutated.
- `dist/` no longer exists in source — it is built into `.deploy/dist/`.
- `npm run serve` serves `.deploy/` so the live preview matches the
  deployed artefact byte-for-byte. **Run `npm run build` once before
  `npm run serve`** so `.deploy/` is populated; the watcher then
  re-runs the relevant builder per source-file change.

## Sviluppo

```bash
npm run check      # Pulisce .deploy/ + dist/ ed esegue test rapidi (lint + unit, no build)
npm run test       # Unit tests + linting
npm run build      # Required once before `npm run serve` (populates .deploy/)
npm run serve      # Avvia dev server su http://localhost:8000 con livereload (serves .deploy/)
npm run validate   # Validazione completa (lint, build, performance budget)
```

Comandi durante lo sviluppo:

- **Edita** i file sorgente nei moduli (`css/*.css`, `js/modules/*.js`)
- **Testa** con `npm run test`
- **Committa** quando i linter passano

## Produzione

```bash
npm run prod       # = npm run build
npm run build      # Minifica + assembla → .deploy/ (artefatto del gh-pages branch)
npm run rebuild    # Pulisce .deploy/ + dist/ e rebuilda
```

## Quality Gates

`npm run build` non ha un `prebuild` hook — è veloce di proposito (~3 s) per iterazione dev. Le quality gate sono separate e composte:

| Comando                           | Cosa fa                                                                                  | Quando usarlo                        |
| --------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| `npm run check`                   | clean dist/ + test:fast (unit + lint:parallel)                                           | gate locale veloce pre-commit        |
| `npm run validate`                | full chain (lint + unit + build + budget)                                                | gate pre-PR                          |
| `npm run validate:lighthouse`     | sopra + Lighthouse mobile/desktop                                                        | release                              |
| `npm run prod`                    | test:all (unit + lint + e2e) + build                                                     | shipping check completo              |
| CI (`.github/workflows/test.yml`) | lint → typecheck → format:check → unit-tests + e2e-tests (parallel) → build → lighthouse | enforced automatico per ogni push/PR |

`npm run build` da solo presuppone che lint + test girino _separatamente_ (in CI o via comandi dedicati). Il budget gzip è enforced inline come step finale del build (`audit:performance`), quindi violazioni di dimensione bloccano comunque.

## Pipeline Dettagliata

Round 20 (option B): every step writes to `.deploy/`, never to source.

```
npm run build
  ↓
[parallel] npm run build:css || npm run build:js
  ├─ build:css                    ← Concatena + minifica CSS (esbuild loader 'css')
  │   ├─ Critical → inline <style> in .deploy/index.html
  │   │     (~<!-- AUTO:CSS_INLINE_RAW -->13.2<!-- /AUTO --> KB raw / ~<!-- AUTO:CSS_INLINE_GZIP -->3.5<!-- /AUTO --> KB gzip)
  │   └─ Deferred → .deploy/dist/style-deferred.min.css
  │         (~<!-- AUTO:CSS_DEFERRED_RAW -->8.8<!-- /AUTO --> KB raw / ~<!-- AUTO:CSS_DEFERRED_GZIP -->2.5<!-- /AUTO --> KB gzip)
  └─ build:js                     ← Bundle + minifica JS (esbuild iife)
      └─ js/main.js + dipendenze → .deploy/dist/main.min.js
            (~<!-- AUTO:JS_RAW -->2.7<!-- /AUTO --> KB raw / ~<!-- AUTO:JS_GZIP -->1.2<!-- /AUTO --> KB gzip)
            sourcemap solo se NODE_ENV ≠ production
  ↓
[serial] npm run build:assets     ← Mirror static assets to .deploy/
  └─ fonts/, images/, .well-known/, sw.js, manifest.webmanifest, robots.txt, humans.txt, LICENSE
  ↓
[serial] npm run build:sitemap    ← Determinismo: lastmod ← latest commit di `index.html|css|js|sw.js`
  └─ source sitemap.xml + injected lastmod → .deploy/sitemap.xml
  ↓
[serial] npm run build:cache-bust ← Hash SHA-256 composito su 10 input
  └─ riscrive ?v=<hash> in .deploy/index.html + CACHE_NAME in .deploy/sw.js
  ↓
[serial] npm run build:csp        ← Calcola hash dello <script>/<style> inline + aggiorna meta CSP in .deploy/index.html
  ↓
[serial] npm run build:strip      ← Rimuove tutti i commenti <!-- ... --> da .deploy/index.html (preserva i marker CSS:BEGIN/CSS:END)
  ↓
[serial] npm run size-report      ← Metriche raw KB per console (sui byte SHIPPED post-strip)
  ↓
[serial] npm run audit:performance ← Verifica budget gzip
       (JS ≤ <!-- AUTO:BUDGET_JS_MAX -->3<!-- /AUTO --> KB, CSS ≤ <!-- AUTO:BUDGET_CSS_MAX -->7.5<!-- /AUTO --> KB, totale ≤ <!-- AUTO:BUDGET_TOTAL_MAX -->10<!-- /AUTO --> KB; build fail se eccede)
  ↓
[serial] npm run docs:numbers     ← Inietta size + budget + LOC counts nei marker AUTO dei doc sorgenti
       (vedi scripts/inject-doc-numbers.js — chiude la classe "drift numerica nei doc")
```

`build:strip` runs BEFORE `size-report` and `docs:numbers` so those
two steps measure the artefact bytes that actually ship — measuring
the pre-strip file would over-report critical CSS by ~1.5 KB because
the regex extractor includes the source-comment block above
`<!-- CSS:BEGIN -->` (which contains a literal `<style>` reference).

## Metriche di Build

**Dopo minificazione (auto-injected dai marker AUTO):**

- CSS critical inlined in HTML: ~<!-- AUTO:CSS_INLINE_GZIP -->3.5<!-- /AUTO --> KB gzip (~<!-- AUTO:CSS_INLINE_RAW -->13.2<!-- /AUTO --> KB raw)
- CSS deferred (`dist/style-deferred.min.css`): ~<!-- AUTO:CSS_DEFERRED_GZIP -->2.5<!-- /AUTO --> KB gzip (~<!-- AUTO:CSS_DEFERRED_RAW -->8.8<!-- /AUTO --> KB raw)
- JS (`dist/main.min.js`): ~<!-- AUTO:JS_GZIP -->1.2<!-- /AUTO --> KB gzip (~<!-- AUTO:JS_RAW -->2.7<!-- /AUTO --> KB raw)
- **Totale shipped: ~<!-- AUTO:TOTAL_GZIP -->7.1<!-- /AUTO --> KB gzip** (entro il budget enforced di <!-- AUTO:BUDGET_TOTAL_MAX -->10<!-- /AUTO --> KB; vedi `scripts/performance-budget.js`)

## Build Outcome

❌ **`npm run build` fallisce se:**

- esbuild non riesce a parsare CSS o JS (sintassi invalida)
- Performance budget gzip eccede (`scripts/performance-budget.js`)
- Cache-bust pattern non trova match in `.deploy/index.html` o `.deploy/sw.js`
- AUTO marker drift: dopo `docs:numbers`, source MD diverge da fresh build (CI fallisce con `git diff --exit-code`)

✅ **`npm run build` produce (round 20 — option B):**

- `.deploy/dist/main.min.js` (+ `.map` se `NODE_ENV ≠ production`)
- `.deploy/dist/style-deferred.min.css`
- `.deploy/index.html` con critical CSS inline + hash CSP reali + `?v=hash` cache-bust + commenti rimossi (post-strip)
- `.deploy/sw.js` con `CACHE_NAME` injettato
- `.deploy/sitemap.xml` con `<lastmod>` derivato deterministicamente da `git log`
- `.deploy/{fonts,images,.well-known}/`, `.deploy/{manifest.webmanifest,robots.txt,humans.txt,LICENSE}` (mirror di sorgente)

**Source `index.html` e `sw.js` NON sono mai mutati dal build** — restano nel loro stato pure-template (`<!-- CSS:BEGIN --><!-- CSS:END -->`, `'sha256-PLACEHOLDER='`, `CACHE_NAME = 'ghironda-PLACEHOLDER'`). Round 20 vieta strutturalmente la mutazione del sorgente da parte del build.

I controlli di lint, coverage e e2e sono separati (vedi sezione "Quality Gates" sopra) — `npm run build` da solo NON li esegue.

## Sourcemaps (per debug)

I sourcemap sono generati per il JS minificato **solo in dev**:

```
.deploy/dist/main.min.js.map  ← solo se NODE_ENV ≠ production
```

In CI/produzione: `NODE_ENV=production node build-js.js` → niente .map shipped (24 KB risparmiati). `.deploy/` è gitignored quindi il map non finisce mai su `main`; lo stale .map viene esplicitamente rimosso da `build-js.js` su build production.

## CI/CD Integration

Pipeline GitHub Actions:

- **`.github/workflows/test.yml`**: lint → unit-tests + e2e-tests (paralleli, ognuno con `npm run build` precedente) → build job (drift gate via `git diff --exit-code` dopo `docs:numbers`) → lighthouse matrix (desktop + mobile, best-of-3 retry)
- **`.github/workflows/deploy.yml`**: gated da `workflow_run` di test.yml (deploy parte solo se CI è verde sullo stesso SHA) → build → orphan-commit + force-push del contenuto di `.deploy/` su `gh-pages`
- **`.github/workflows/release.yml`**: validate-semver + tag pre-check → validate (lint + unit + audit) + e2e-validate (con build) → build-release → lighthouse matrix (desktop + mobile, BLOCKING=true) → create-release

## Cleanup

```bash
npm run clean      # Rimuove .deploy/ e dist/ (legacy locale pre-round-20)
npm run rebuild    # Clean + Build completo
```

## TypeScript configuration notes

The codebase is JavaScript with JSDoc annotations, type-checked via `tsc --noEmit`. Three configs split the scope:

- [tsconfig.json](tsconfig.json) — runtime client code (`js/**`, `types/**`).
- [tsconfig.scripts.json](tsconfig.scripts.json) — build pipeline scripts.
- [tsconfig.sw.json](tsconfig.sw.json) — service worker (`sw.js`).

`strict: true` is enabled but `noImplicitAny: false` is **deliberately** kept off in [tsconfig.json](tsconfig.json). With `allowJs: true` + `checkJs: true`, enabling `noImplicitAny` would flood the diff with `// @ts-ignore` markers for every JSDoc-elided parameter; the team's policy is to write JSDoc only where the type is non-obvious and let `tsc` infer the rest. `noUnusedLocals` / `noUnusedParameters` are similarly off because ESLint already reports unused identifiers via `no-unused-vars` with project-tuned exceptions (a single tool owning that rule avoids contradictory reports).
