# Security Policy

## Supported versions

Questo è un sito statico single-page deployato su GitHub Pages. La sola
versione "supportata" è il branch `main`: ogni fix di sicurezza viene
applicato lì e propagato al deploy successivo. Non esistono branch di
supporto a lungo termine.

| Branch                                    | Supportato              |
| ----------------------------------------- | ----------------------- |
| `main`                                    | ✅                      |
| altri branch (`hotfix/**`, feature, ecc.) | ❌ — solo working state |

## Reporting a vulnerability

Se hai scoperto una vulnerabilità di sicurezza che riguarda questo sito (es.
XSS via inline script/CSP bypass, supply-chain compromission via dipendenze
npm, vulnerabilità nel Service Worker), **NON aprirla come issue pubblica**.

### Canali di reporting

1. **GitHub Security Advisories** (preferito):
   apri una private vulnerability report su
   <https://github.com/marco-onapex/La-Compagnia-della-Ghironda/security/advisories/new>
   — solo i maintainer la vedono finché non viene pubblicata.

2. **Email** (se non hai accesso a GitHub):
   `marcodipaola.informatica@gmail.com` con oggetto
   `[SECURITY] La Compagnia della Ghironda — <breve titolo>`.

### Cosa includere nel report

- Versione/commit interessato
- Passi per riprodurre (anche un PoC è utile, ma non obbligatorio)
- Impatto stimato (cosa può fare un attaccante)
- Eventuali mitigation che hai già verificato

### Cosa aspettarti

| Step                       | Tempo target                                                |
| -------------------------- | ----------------------------------------------------------- |
| Acknowledgement del report | entro 3 giorni lavorativi                                   |
| Triage iniziale + severity | entro 7 giorni lavorativi                                   |
| Fix in `main`              | entro 14 giorni per HIGH/CRITICAL, 30 giorni per MEDIUM/LOW |
| Disclosure pubblica        | dopo deploy del fix, con credito al reporter (opt-in)       |

I CVE non sono richiesti — il progetto è abbastanza piccolo da non figurare
nei feed pubblici. Se ritieni che il caso meriti CVE assignment, indicalo
nel report.

## Out of scope

- **Bug funzionali**: aprire un issue normale
- **Bug di rendering, CSS, font**: aprire un issue normale
- **Suggestions su CSP più restrittiva**: aprire una PR
- **Vulnerabilità in dipendenze già note (CVE pubblico)**: spesso Dependabot
  ha già aperto la PR; verifica `npm audit` prima di aprire un report

## Quality gate sicurezza già in atto

- `npm audit` automatico al post-install (`audit-level=moderate`)
- Dependabot weekly (npm + github-actions, raggruppato per stack)
- CodeQL JS scan su ogni PR + weekly cron (security-extended queries)
- CSP **strict**: nessun `'unsafe-inline'`/`'unsafe-eval'`; ogni inline
  `<script>` (incluso JSON-LD) e ogni inline `<style>` deve essere
  autorizzato dal proprio SHA-256 hash, ricalcolato a build time da
  `scripts/generate-csp.js` (drift = browser refuse, fail-loud).
- CSP directives: `default-src 'self'`, `worker-src 'self'`, `object-src 'none'`,
  `base-uri 'self'`, `form-action 'none'`, `connect-src 'self'`,
  `manifest-src 'self'`. `upgrade-insecure-requests` is **deliberately
  omitted** — il sito è interamente same-origin su un host HTTPS-only
  (GitHub Pages + HSTS), e WebKit applica la direttiva anche su localhost,
  rompendo il path di sviluppo.
- ESLint con `eslint-plugin-security` + `eslint-plugin-no-unsanitized` per
  catturare `innerHTML`/`document.write`/`eval`/regex injection a commit time.
- Cache-bust composito SHA-256 — nessun asset stale dopo deploy.
- Service Worker: `same-origin` filter, scope esplicito `./`, content-type
  policy che rifiuta di cachare risposte con MIME mismatch (defence
  contro response-confusion / cache poisoning).
- GitHub Actions: SHA-pinned (tutte le actions, ufficiali e third-party),
  `permissions: contents: read` di default, escalation esplicita per
  job-by-job, `update-snapshots` workflow gated su attore = maintainer.
- Husky pre-commit + pre-push (test + lint) — fail-loud locale prima del CI.
- Coverage 100% globale + per-file, mutation testing 100% via Stryker —
  nessuna logica non esercitata che possa nascondere regressioni.

## HTTP headers che richiedono il deploy host (limite GitHub Pages)

GitHub Pages non permette di settare HTTP response headers custom. Le
seguenti directive sono best-practice ma possono essere applicate solo
migrando il deploy a un host con supporto `_headers` (Cloudflare Pages,
Netlify, Vercel) o davanti a GH Pages tramite proxy:

| Header                                            | Stato            | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Frame-Options: DENY`                           | ❌ non applicato | GH Pages NON manda XFO per default (assunzione contraria nel commento di `generate-csp.js` versione precedente — corretta). Mitigation alternativa: `frame-ancestors 'none'` via header HTTP, oppure frame-busting JS come last-resort.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `Strict-Transport-Security`                       | ⚠️ ereditato     | `*.github.io` è già nella HSTS preload list di Chromium/Firefox/Safari. Su custom domain, l'HSTS preload non è ereditato — va ri-richiesto a `hstspreload.org` o servito via header.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Content-Security-Policy: frame-ancestors 'none'` | ❌ ignorato      | La directive è silenziosamente ignorata via `<meta http-equiv>` (warning console dev-tools); funziona solo come HTTP header.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Permissions-Policy`                              | ❌ non applicato | Non supportata via `<meta>` da tutti i browser. Il sito non usa camera/microfono/geolocation/payment, quindi l'esposizione è teorica, ma su deploy host moderni va impostata `camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()`.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Cross-Origin-Opener-Policy: same-origin`         | ❌ non applicato | Mitigation Spectre/cross-origin attacks. Non bloccante per un sito che non usa `SharedArrayBuffer` o `postMessage` cross-origin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `X-Content-Type-Options: nosniff`                 | ❌ non applicato | GH Pages serve `Content-Type` corretto per default; `nosniff` è defense-in-depth.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Content-Security-Policy: report-uri / report-to` | ❌ non applicato | GH Pages non permette di settare HTTP header custom (incluso `Reporting-Endpoints` necessario per `report-to`); il `<meta http-equiv>` form non supporta `report-uri`/`report-to` cross-browser. Conseguenza: violazioni CSP NON sono raccolte server-side. Mitigation: monitor manuale via DevTools console durante test; in produzione una violazione ROMPE silenziosamente la pagina ma non viene segnalata. La SHA-256 dell'inline `<style>`/`<script>` va ricalcolata (`scripts/generate-csp.js`) ad ogni modifica HTML — un proxy CDN che alteri lo whitespace dell'HTML romperebbe il match e bloccherebbe l'inline. GH Pages non lo fa (assunzione invariante). |

In caso di **migrazione a custom domain** o **cambio host**, riapplicare
questi header è la prima azione di sicurezza richiesta. In particolare,
`report-to` su un endpoint same-origin (anche statico via static-site
proxy) abiliterebbe la raccolta delle violazioni CSP per detection
proattiva.
