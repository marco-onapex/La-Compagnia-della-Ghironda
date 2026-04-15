# CI/CD Pipeline

Questa repository utilizza GitHub Actions per garantire qualità, performance e best practices.

## 📋 Verifiche Automatiche

### 1. **Code Quality** (`quality-checks`)
- **HTMLHint**: Valida la struttura HTML
  - Tag lowercase, attributi validi, head/body corretti
  - IDs univoci, src non vuoti

- **Stylelint**: Valida CSS seguendo standard SCSS/CSS
  - Sintassi corretta, nomi proprietà validi
  - Ordine proprietà, selezioni corrette

- **ESLint**: Linting JavaScript
  - Sintassi corretta, variabili non utilizzate
  - Best practices ES6+, indentazione coerente

- **Link Checker**: Verifica assenza link rotti
  - Controlla tutte le URL interne/esterne
  - Accetta 200, 301, 403 status codes

- **Security Headers**: Valida header di sicurezza
  - Content-Security-Policy (CSP)
  - X-UA-Compatible, Referrer-Policy

### 2. **Lighthouse Audit** (`lighthouse`)
Performance audit automatico con metriche Core Web Vitals:
- **Performance**: LCP, CLS, FID
- **Accessibility**: WCAG compliance
- **Best Practices**: Browser features, obsolete APIs
- **SEO**: Meta tags, structured data
- **PWA**: Service worker, manifest

Target minimo: **90/100** per Performance, Accessibility, Best Practices
Target massimo: **100/100** per SEO

### 3. **Accessibility** (`accessibility`)
Audit di accessibilità con **axe DevTools CLI**:
- WCAG 2.1 Level AA compliance
- Aria attributes validi
- Color contrast minimo 4.5:1
- Focus indicators visibili
- Alternative text per immagini

### 4. **SEO Validation** (`seo-validation`)
Controlla best practices per motori di ricerca:
- Meta tags essenziali (charset, viewport, description)
- Open Graph tags (social sharing)
- Schema.org/JSON-LD (structured data)
- Canonical links
- robots.txt e sitemap.xml

### 5. **Performance Metrics** (`performance-metrics`)
Analisi statica delle risorse:
- File sizes (CSS, JS, HTML)
- Struktura HTML (heading count, meta tags)
- Total project size

## 🚀 Esecuzione Locale

Installa le dipendenze:
```bash
npm install
```

Esegui tutti i test:
```bash
npm run validate
```

Comandi singoli:
```bash
npm run lint:html    # Valida HTML
npm run lint:css     # Valida CSS
npm run lint:js      # Lint JavaScript
npm run lint         # Tutti i linter
npm run lighthouse   # Audit performance
npm run test         # Tutti i test
```

## 📊 Risultati

### Push & Pull Request
Ogni push su `main` o PR aperta esegue automaticamente tutti i check.

### Artifacts
Lighthouse genera report HTML salvati come artifacts in GitHub Actions:
- Scaricabili da Actions → Run details → Artifacts
- Include metriche dettagliate e suggerimenti

### Dependabot
Aggiornamenti automatici dipendenze:
- **Frequenza**: Weekly (lunedì)
- **PR automatiche**: Per ogni aggiornamento
- **Label**: `dependencies` per facile filtraggio

## ✅ Status Badge

Aggiungi questo a README.md per mostrare lo stato della build:

```markdown
[![CI/CD Pipeline](https://github.com/marco-onapex/La-Compagnia-della-Ghironda/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/marco-onapex/La-Compagnia-della-Ghironda/actions)
```

## 🎯 Best Practices per Static Pages

### 1. HTML Structure
- Semantic HTML5 ✓
- Single H1 per pagina ✓
- Heading hierarchy logica ✓
- Meta tags completi ✓

### 2. CSS Organization
- Variables CSS per consistency ✓
- Mobile-first responsive design ✓
- No inline styles ✓
- Commenti per sezioni complesse ✓

### 3. JavaScript Performance
- Vanilla JS senza dipendenze ✓
- Intersection Observer per lazy loading ✓
- requestIdleCallback per non-critical code ✓
- Modern browser support ✓

### 4. Performance
- Image optimization (WebP + PNG fallback) ✓
- Font loading strategy (display=swap) ✓
- Minified resources ✓
- Gzip compression (GitHub Pages) ✓

### 5. SEO & Meta
- Proper meta tags (charset, viewport, description) ✓
- Open Graph & Twitter Cards ✓
- Schema.org structured data ✓
- Canonical URLs ✓
- robots.txt & sitemap.xml ✓

### 6. Accessibility
- WCAG 2.1 Level AAA ✓
- Semantic HTML ✓
- ARIA attributes dove necessario ✓
- Focus indicators visibili ✓
- Color contrast 7:1+ ✓
- Reduced motion support ✓

### 7. Security
- Content-Security-Policy header ✓
- No inline scripts/styles ✓
- External dependencies: CDN con integrity checks ✓
- Input sanitization (n/a per static site) ✓

### 8. Monitoring
- Lighthouse scores tracked ✓
- Performance metrics monitored ✓
- Broken link detection ✓
- Dependency updates automatic ✓

## 📚 Reference

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Lighthouse CI Documentation](https://github.com/GoogleChrome/lighthouse-ci)
- [Web Vitals Guide](https://web.dev/vitals/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [SEO Starter Guide](https://developers.google.com/search/docs)
