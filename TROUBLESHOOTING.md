# Troubleshooting

## Web Vitals telemetry (FCP / LCP / CLS / INP) non arriva al mio endpoint

**Sintomo:** Il sito carica ma `js/modules/vitals.js` non sta inviando beacon al tuo endpoint analytics.

**Causa 1 — endpoint non attivato.** Il modulo `vitals.js` è opt-in tramite `window.__vitalsEndpoint`. Senza quella variabile, le metriche vengono raccolte in `window.__vitals` (per ispezione DevTools) ma non trasmesse via `sendBeacon`.

**Soluzione (attivazione runtime via URL):** Aggiungi `?vitals=PERCORSO` all'URL della pagina. Il valore deve essere un path relativo o un URL assoluto sullo stesso origin. Esempi:

```
https://marco-onapex.github.io/La-Compagnia-della-Ghironda/?vitals=/__vitals
https://marco-onapex.github.io/La-Compagnia-della-Ghironda/?vitals=/api/log
```

`main.js` legge il parametro al boot e imposta `window.__vitalsEndpoint`. `vitals.js` lo usa come destinazione di ogni `sendBeacon`.

**Causa 2 — endpoint cross-origin rifiutato.** `vitals.js` blocca esplicitamente endpoint cross-origin per evitare exfiltration. Solo path same-origin sono accettati. Se hai bisogno di routing verso un servizio esterno (Cloudflare Analytics, Plausible, ecc.), monta un proxy same-origin (es. Cloudflare Worker su un sottodominio del sito) e usa quello come `?vitals=URL`.

**Causa 3 — il browser non supporta l'API.** Il modulo è defensive: ogni `PerformanceObserver` è in try/catch e loggato via `devWarn`. Su browser molto vecchi (no `PerformanceObserver` o no `event` type) le metriche non vengono raccolte e nessun beacon viene inviato — è il comportamento atteso.

---

## CSP hash mismatch (script bloccato in console)

**Sintomo:** Il browser blocca l'esecuzione dello script inline con `Refused to execute inline script because it violates the following Content Security Policy directive`.

**Causa:** Il contenuto dell'inline `<script>` in `index.html` è cambiato ma il hash SHA-256 nella direttiva `Content-Security-Policy` non è stato aggiornato.

**Soluzione:**

```bash
npm run build:csp
```

Questo script ricalcola automaticamente il hash e aggiorna il meta CSP. È incluso nel `npm run build` ma può essere eseguito autonomamente dopo ogni modifica allo script inline.

---

## Font non trovati (404 su cinzel-\*.woff2)

**Sintomo:** Il browser mostra 404 per i file `fonts/cinzel-*.woff2` o il testo appare nel font di fallback.

**Causa 1:** I file `.woff2` non sono stati generati.

```bash
npm run build:fonts
```

**Causa 2:** Il path nei `@font-face` non corrisponde alla struttura delle directory. I font devono stare in `fonts/` nella root del progetto (stessa cartella di `index.html`).

**Causa 3:** Stai aprendo `index.html` direttamente dal filesystem (`file://`). Usa sempre il dev server:

```bash
npm run serve   # avvia http-server su http://localhost:8000
```

---

## Coverage sotto soglia (Jest fallisce)

**Sintomo:** `npm run test:unit` esce con `Jest: "<file>" coverage threshold for statements (100%) not met`.

**Soluzione:** Aggiungi test per le funzioni o branch non coperti. Per vedere cosa manca:

```bash
npm run test:unit -- --coverage --verbose
# oppure apri coverage/lcov-report/index.html nel browser
```

La soglia è 100% per-file (non globale) — un singolo file scoperto fallisce la build. Se un branch è genuinamente non raggiungibile da jsdom (es. `typeof window === 'undefined'`, `requestIdleCallback` fallback), aggiungi un commento `/* istanbul ignore next -- <ragione> */` con la giustificazione.

```js
// jest.config.cjs (estratto)
coverageThreshold: {
  './js/main.js': { statements: 100, functions: 100, lines: 100, branches: 100 },
  // ... per-file entries for every js/ source
  global: { statements: 100, functions: 100, lines: 100, branches: 100 },
}
```

---

## ESLint fallisce su `no-console`

**Sintomo:** `error  Unexpected console statement  no-console` in un file `js/**/*.js`.

**Causa:** I file client-side JS non possono usare `console.*` direttamente (regola anti-debug-leak).

**Soluzione corretta:** Usa il wrapper `devWarn` da `js/modules/logger.js`:

```js
import { devWarn } from './logger.js';
// ...
catch (error) { devWarn(error); }
```

`devWarn` è attivo solo su `localhost` e viene eliminato come no-op in produzione.

Se hai bisogno di `console.log` in uno script Node (es. in `scripts/`), è già permesso dal config ESLint.

---

## Build fallisce a metà pipeline

**Sintomo:** `npm run build` si ferma prima di produrre i file finali in `dist/` (o produce dist/ ma poi `audit:performance` blocca).

**Causa:** la pipeline è veloce di proposito (~3 s) e NON ha un `prebuild` hook con lint/test. Le quality gate sono separate (`npm run check`, `npm run validate`, `npm run test:all`). I tipici punti di fallimento del solo `build` sono:

1. **`build:cache-bust` o `build:csp` non trovano un asset richiesto** (es. font woff2 mancante o `images/ghironda-720.webp` non rigenerato).
2. **`audit:performance`** rileva che il bundle gzip ha sforato il budget definito in `scripts/performance-budget.js` (JS ≤ <!-- AUTO:BUDGET_JS_MAX -->3<!-- /AUTO --> KB, CSS ≤ <!-- AUTO:BUDGET_CSS_MAX -->7.5<!-- /AUTO --> KB, totale ≤ <!-- AUTO:BUDGET_TOTAL_MAX -->10<!-- /AUTO --> KB).

**Debug rapido:**

```bash
npm run build:css     # Compila solo il CSS critico + deferred
npm run build:js      # Compila solo il JS bundle
npm run build:cache-bust   # Aggiorna gli ?v= e CACHE_NAME
npm run build:csp     # Rigenera le hash CSP per gli inline <style>/<script>
npm run audit:performance  # Verifica i budget gzip
```

Per i quality gate **separati** (NON parte di `build`):

```bash
npm run lint          # ESLint + Stylelint + HTMLHint
npm run typecheck     # tsc --strict (DOM + WebWorker)
npm run format:check  # Prettier
npm run test:unit     # Jest + 100% coverage
```

---

## Visual regression test fallisce (screenshot diverso dalla baseline)

**Sintomo:** `npm run test:visual` fallisce con `Screenshot comparison failed` e mostra un diff.

**Se il cambiamento è intenzionale** (es. nuovo stile CSS):

```bash
npm run test:visual:update   # rigenera le baseline locali (Windows/macOS)
```

Per rigenerare le baseline **Linux** che girano in CI, vedi la sezione successiva — non basta committare le PNG locali.

**Se il cambiamento non è intenzionale:** il diff indica una regressione CSS. Controlla:

- Le modifiche recenti a `css/` o `index.html`
- Eventuali animazioni non disattivate (devono rispettare `prefers-reduced-motion`)
- Variazioni di font rendering tra OS (le baseline sono generate per browser/OS specifico)

Le baseline si trovano in `tests/e2e/visual.spec.js-snapshots/`. Solo le varianti `*-linux.png` sono versionate in git (vedi `.gitignore`); `*-win32.png` e `*-darwin.png` sono locali per non polluire il repo con artefatti host-specific.

---

## Visual regression: come seminare/rigenerare le baseline Linux per CI

**Contesto:** Il regression test confronta screenshot pixel-by-pixel. Su CI gira solo Linux, quindi l'unico baseline che conta è `*-linux.png`. Le baseline locali (`*-win32.png` / `*-darwin.png`) sono usate solo per l'iterazione del developer e sono `.gitignore`-ate.

**Quando serve:**

1. **Prima volta** (seed iniziale): se `git ls-files tests/e2e/visual.spec.js-snapshots/` non restituisce nessuna `*-linux.png`, il regression test su CI è dormiente — ogni run rigenera silenziosamente le baseline mancanti via `updateSnapshots: 'missing'` e il test passa banalmente, senza confronto.
2. **Dopo un design change intenzionale**: aggiornato CSS/markup → le PNG vecchie non corrispondono più → il test rosso è atteso.

**Procedura (via GitHub Actions, modo ufficiale):**

1. GitHub UI → tab **Actions** → workflow **Update Visual Snapshots** → **Run workflow**
2. Inserisci una `reason` chiara (es. `"initial baseline seed"` o `"refactor hero typography"`)
3. Il job:
   - Installa Playwright + browser su Linux
   - Esegue `playwright test --update-snapshots` → genera tutte le `*-linux.png`
   - Le ri-confronta (deve passare al secondo giro)
   - Apre una PR `chore/update-visual-baselines-<timestamp>` con i diff
4. Reviewa le PNG nella PR (ogni cambio è una modifica visibile all'utente)
5. Mergi → da quel momento i regression test su CI hanno mordente

**Procedura locale (Linux/WSL solo):**

```bash
npx playwright test tests/e2e/visual.spec.js --update-snapshots
git add tests/e2e/visual.spec.js-snapshots/*-linux.png
git commit -m "test: update visual baselines"
```

**Cosa NON fare:** committare le `*-win32.png` o `*-darwin.png`. Non vengono caricate da CI (il selettore Playwright è OS-aware: `<name>-<browser>-<platform>.png`).

---

## Playwright non trova il server (ECONNREFUSED)

**Sintomo:** I test E2E falliscono con `net::ERR_CONNECTION_REFUSED` su `http://localhost:8000`.

**Causa:** Il `webServer` configurato in `playwright.config.cjs` non si è avviato correttamente.

**Soluzioni:**

1. Controlla che la porta 8000 sia libera: `netstat -an | grep 8000`
2. Avvia il server manualmente prima dei test: `npm run serve`
3. In CI, assicurati che `http-server` sia installato: `npm install`

---

## Stylelint fallisce su specificity

**Sintomo:** `selector-max-specificity` error in un file CSS.

**Regola:** La specificità massima consentita è `0,3,2` (configurata in `.stylelintrc`).

**Come calcolare la specificità:** `(id, class/attr/pseudo-class, element/pseudo-element)`. Evita selettori concatenati profondi. Preferisci classi BEM-like invece di selettori a catena.

---

## Visual baselines missing in CI

**Sintomo:** Il job `E2E Tests (Playwright)` in CI mostra un blocco prominente nel job-summary:

> ⚠️ Visual regression test SKIPPED — No `*-linux.png` baselines are committed in `tests/e2e/visual.spec.js-snapshots/`.

I test e2e non-visual (accessibility, console-clean, mobile, keyboard, fonts, main) girano normalmente; solo `visual.spec.js` è stato saltato.

**Causa:** Le baseline di visual-regression sono PNG renderizzate da Chromium / Firefox / WebKit headless su Linux. Sono platform-specific (gli stessi browser su Windows / macOS producono pixel diversi a causa di subpixel-AA, font hinting, GPU vendor) → `.gitignore` traccia solo `*-linux.png`. Su un fresh clone o sul primo PR di un contributor le baseline Linux sono assenti finché qualcuno non triggera il workflow di seeding.

Storicamente questa condizione era un hard-failure (CI red). È stata rilassata a soft-warning + skip-visual perché far fallire la pipeline su un repo nuovo era amareggiante per i contributor; il trade-off accettato è che senza baseline il visual-regression non protegge nulla — situazione esplicitamente segnalata nel job summary di `test.yml`.

**Soluzione (seed iniziale o ri-seed dopo design change):**

1. Vai su **Actions → Update Visual Snapshots** (workflow_dispatch).
2. Click **Run workflow** sul branch target. Il campo `reason` è obbligatorio (es. `"initial seed"`, `"after design change to header"`).
3. Il workflow installa Playwright, esegue `playwright test --update-snapshots`, e apre un PR con i `*-linux.png` generati. Review + merge.
4. Le run successive di `Test & Verify` confronteranno i pixel contro queste baseline. Diff > 3 % → CI fail con artifact diff scaricabile.

**Locale (per debug, non per CI):**

```bash
npm run test:visual:update   # rigenera *-win32.png o *-darwin.png (gitignored)
```

I baseline locali NON vengono committati — solo le `*-linux.png` (generate dal workflow CI) servono come ground-truth condivisa.
