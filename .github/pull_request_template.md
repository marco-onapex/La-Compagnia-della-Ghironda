<!--
PR title: use Conventional Commits / usa Conventional Commits.
  feat(scope):  | fix(scope):  | perf(scope):  | refactor(scope):
  docs(scope):  | test(scope): | chore(scope): | style(scope):
Allowed scopes (commitlint enforces): css, js, html, build, ci, workflow,
release, hotfix, docs, deps, config, a11y, perf, security, sw, tests.
Example / Esempio: `feat(observer): debounce resize listener`

For security issues, do NOT open a PR — see [SECURITY.md](../SECURITY.md)
for the private disclosure channel.
Per problemi di sicurezza, NON aprire una PR — vedi
[SECURITY.md](../SECURITY.md) per il canale privato di disclosure.
-->

## What changes / Cosa cambia

<!-- 1-3 lines on the user-observable change.
     1-3 righe sul "cosa" osservabile dall'utente. -->

## Why / Perché

<!-- The "why": bug, feature, refactor, etc. Link the issue if relevant.
     Il "perché": bug, feature, refactor, ecc. Linka issue se rilevante. -->

## How I verified / Come ho verificato

<!-- Tick only the boxes that genuinely apply.
     Spunta solo le caselle realmente applicabili. -->

- [ ] `npm run check` (clean + lint:parallel + test:unit) passes / passa
- [ ] `npm run build` passes / passa, performance budget gzip respected / rispettato
- [ ] `npm run test:e2e` passes / passa on every browser (chromium/firefox/webkit)
- [ ] Visual rendering changed → regenerated local baselines and/or triggered the
      `Update Visual Snapshots` workflow for Linux baselines
      / Cambia il rendering visivo → ho rigenerato le baseline locali e/o
      triggerato `Update Visual Snapshots` workflow per le baseline Linux
- [ ] Public API / CSS variable changed → docs updated (README, ARCHITECTURE,
      CSS-ARCHITECTURE, BUILD, PERFORMANCE-STRATEGY, TESTING)
      / Cambia un'API pubblica/CSS variable → docs aggiornata
- [ ] Bundle size changed → numbers refreshed in PERFORMANCE-STRATEGY.md
      / Cambia il bundle size → numeri aggiornati
- [ ] CSP / SW / cache strategy changed → SECURITY.md still coherent
      / Cambia il CSP/SW/cache strategy → SECURITY.md ancora coerente

## Notes for the reviewer / Note per il reviewer

<!-- Things not obvious from the diff: trade-offs, edge cases, follow-ups.
     Cose non ovvie dal diff: trade-off, edge case, follow-up rimasto fuori. -->
