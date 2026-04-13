# Build Pipeline

## Sviluppo

```bash
npm run dev        # Pulisce dist/ e esegue i linter
npm run test       # Esegue solo i linter
npm run validate   # Alias per test
```

Comandi durante lo sviluppo:
- **Edita** i file sorgente nei moduli (`css/*.css`, `js/modules/*.js`)
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
[build] npm run build:css        ← Concatena + minifica CSS
  └─ build-css.js: 9 moduli → dist/style.min.css (~27 KB)
  ↓
[build] npm run build:js         ← Bundle + minifica JS + sourcemap
  └─ build-js.js + Terser API → dist/main.min.js (~5 KB)
  ↓
[build] npm run size-report      ← Mostra metriche
  ├─ CSS: ~27 KB minificato
  └─ JS: ~5 KB minificato
```

## Metriche di Build

**Dopo minificazione:**
- CSS: 9 moduli sorgente → ~27 KB (`dist/style.min.css`)
- JS: 6 moduli sorgente → ~5 KB (`dist/main.min.js`) + sourcemap

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

## CI/CD Integration

Pipeline GitHub Actions in `.github/workflows/test.yml`:
- **lint** → unit-tests + e2e-tests in parallelo → **build** → lighthouse (solo PR)

## Cleanup

```bash
npm run clean      # Rimuove dist/
npm run rebuild    # Clean + Build completo
```
