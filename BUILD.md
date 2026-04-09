# Build Pipeline

## Sviluppo

```bash
npm run dev        # Pulisce dist/ e esegue i linter
npm run test       # Esegue solo i linter
npm run validate   # Alias per test
```

Comandi durante lo sviluppo:
- **Edita** i file sorgente (`css/style.css`, `js/main.js`)
- **Testa** con `npm run test`
- **Committa** quando i linter passano

## Produzione

```bash
npm run prod       # = npm run build
npm run build      # Minifica, testa, e genera report dimensione
npm run rebuild    # Pulisce dist/ e rebuilda
```

## Build Hook Automatico

`prebuild` hook garantisce che:
1. ✅ I linter SEMPRE passano prima di buildare
2. ✅ Se linting fallisce, il build non avviene
3. ✅ Protegge da broken builds

## Pipeline Dettagliata

```
npm run build
  ↓
[prebuild] npm run test          ← Verifica linter
  ├─ npm run lint:html           (0 errori)
  ├─ npm run lint:css            (0 errori)
  └─ npm run lint:js             (0 errori)
  ↓
[build] npm run build:css        ← Minifica CSS
  └─ csso css/style.css → dist/style.min.css (55.9% smaller)
  ↓
[build] npm run build:js         ← Minifica JS + sourcemap
  └─ terser js/main.js → dist/main.min.js (68.2% smaller)
  ↓
[build] npm run size-report      ← Mostra metriche
  ├─ CSS: 19.95 KB minificato
  └─ JS: 6.30 KB minificato
```

## Metriche di Build

**Dopo minificazione:**
- CSS: 45.2 KB → 19.95 KB (**-55.9%**) 🎉
- JS: 19.8 KB → 6.30 KB (**-68.2%**) 🎉

**Totale**: 65 KB → 26.25 KB (**-59.6%** di riduzione) ✨

## Quality Gates

❌ **Build fallisce se:**
- HTML ha errori non validi (doctype, tag pair, etc.)
- CSS viola regole stylelint-config-standard v40
- JS ha variabili non usate o sintassi invalida

✅ **Build procede solo se:**
- Tutti i linter passano (ZERO errori)
- Minificazione ha successo
- File .min.js/.min.css sono creati

## Sourcemaps (per debug)

I sourcemap sono generati per il JS minificato:
```
dist/main.min.js.map  ← Include riferimento a linee originali
```

Utile per:
- Debugging in produzione
- Stack trace leggibili
- DevTools mostra riga originale del source

## CI/CD Integration (futuro)

```yaml
# .github/workflows/build.yml
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run prod  # Fallisce se linting fails
      - run: npm run test
```

## Cleanup

```bash
npm run clean      # Rimuove dist/
npm run rebuild    # Clean + Build completo
```
