#!/usr/bin/env node

/**
 * Full Validation Pipeline
 *
 * Phases (each waits for the previous to succeed):
 *   1. Lint + Unit Tests  — in parallel
 *   2. Build CSS + JS     — in parallel
 *   3. Performance budget check
 *   4. Lighthouse audit   — only with --lighthouse flag (slow, ~3 min)
 *
 * Usage:
 *   node scripts/validate.js
 *   node scripts/validate.js --lighthouse
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 8001;
const RUN_LIGHTHOUSE = process.argv.includes('--lighthouse');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function step(n, total, label) {
  console.log(`\n[${n}/${total}] ${label}`);
}

/** Run a shell command, inherit stdio. Throws on non-zero exit. */
function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

/**
 * Run two shell commands concurrently.
 * Returns a promise that rejects with the first failure label.
 */
function runParallel(tasks) {
  return Promise.all(
    tasks.map(({ label, cmd }) =>
      new Promise((resolve, reject) => {
        const [bin, ...args] = cmd.split(' ');
        const child = spawn(bin, args, { cwd: ROOT, stdio: 'inherit', shell: true });
        child.on('close', code => {
          if (code === 0) resolve();
          else reject(new Error(`"${label}" exited with code ${code}`));
        });
        child.on('error', err => reject(new Error(`"${label}": ${err.message}`)));
      })
    )
  );
}

/** Start a minimal static HTTP server on PORT. Returns the server instance. */
function startServer() {
  return new Promise((resolve, reject) => {
    const MIME = {
      '.html': 'text/html',
      '.css':  'text/css',
      '.js':   'application/javascript',
      '.png':  'image/png',
      '.webp': 'image/webp',
      '.svg':  'image/svg+xml',
      '.json': 'application/json',
      '.ttf':  'font/ttf',
      '.woff': 'font/woff',
      '.woff2':'font/woff2',
    };

    const server = http.createServer((req, res) => {
      const safePath = req.url.split('?')[0].replace(/\.\./g, '');
      const file = path.join(ROOT, safePath === '/' ? 'index.html' : safePath);
      try {
        const content = fs.readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'text/plain' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

/** Run a Lighthouse audit and return the parsed report. */
async function runLighthouse(url, formFactor) {
  // Dynamic import — lighthouse is an optional dependency for this step
  const { default: lighthouse } = await import('lighthouse');
  const { launch } = await import('chrome-launcher');

  const chrome = await launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const result = await lighthouse(url, {
      logLevel: 'error',
      output: 'json',
      port: chrome.port,
      formFactor,
      screenEmulation: formFactor === 'mobile'
        ? { mobile: true, width: 390, height: 844, deviceScaleFactor: 3, disabled: false }
        : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });
    return JSON.parse(result.report);
  } finally {
    try { chrome.kill(); } catch { /* ignore */ }
  }
}

const LIGHTHOUSE_THRESHOLDS = {
  performance:      80,
  accessibility:    95,
  'best-practices': 90,
  seo:              90,
};

function checkLighthouseThresholds(label, report) {
  const failures = [];
  for (const [cat, min] of Object.entries(LIGHTHOUSE_THRESHOLDS)) {
    const score = Math.round(report.categories[cat].score * 100);
    if (score < min) failures.push(`    ${cat}: ${score} < ${min} (required)`);
  }
  if (failures.length > 0) {
    throw new Error(`${label} Lighthouse below thresholds:\n${failures.join('\n')}`);
  }
}

function printLighthouseScores(label, report) {
  const s = report.categories;
  const a = report.audits;
  console.log(`\n  ${label}`);
  console.log(`    Performance:    ${Math.round(s.performance.score * 100)}/100`);
  console.log(`    Accessibility:  ${Math.round(s.accessibility.score * 100)}/100`);
  console.log(`    Best Practices: ${Math.round(s['best-practices'].score * 100)}/100`);
  console.log(`    SEO:            ${Math.round(s.seo.score * 100)}/100`);
  if (a['first-contentful-paint'])
    console.log(`    FCP: ${Math.round(a['first-contentful-paint'].numericValue)} ms  ` +
                `LCP: ${Math.round(a['largest-contentful-paint'].numericValue)} ms  ` +
                `CLS: ${a['cumulative-layout-shift'].numericValue.toFixed(3)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TOTAL = RUN_LIGHTHOUSE ? 4 : 3;

async function main() {
  console.log('='.repeat(50));
  console.log(' Full Validation Pipeline');
  if (RUN_LIGHTHOUSE) console.log(' (Lighthouse enabled)');
  console.log('='.repeat(50));

  // ── Phase 1: Lint + Unit Tests (parallel) ──────────────────────────────────
  step(1, TOTAL, 'Lint (HTML+CSS+JS) + Unit Tests  [parallel]');
  await runParallel([
    { label: 'lint',       cmd: 'npm run lint:parallel' },
    { label: 'unit-tests', cmd: 'npm run test:unit'     },
  ]);
  console.log('  ok  lint + unit tests');

  // ── Phase 2: Build CSS + JS (parallel) ────────────────────────────────────
  step(2, TOTAL, 'Build CSS + JS  [parallel]');
  await runParallel([
    { label: 'build:css', cmd: 'npm run build:css' },
    { label: 'build:js',  cmd: 'npm run build:js'  },
  ]);
  console.log('  ok  build');

  // ── Phase 3: Performance budget ───────────────────────────────────────────
  step(3, TOTAL, 'Performance budget check');
  run('node scripts/performance-budget.js');
  console.log('  ok  performance budget');

  if (!RUN_LIGHTHOUSE) {
    printSummary();
    return;
  }

  // ── Phase 4: Lighthouse (mobile + desktop, sequential) ────────────────────
  step(4, TOTAL, 'Lighthouse audit  (mobile + desktop)');
  console.log('  This takes ~3-5 min...');

  const server = await startServer();
  console.log(`  server on http://localhost:${PORT}`);

  fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });

  let mobileReport, desktopReport;

  try {
    const url = `http://127.0.0.1:${PORT}`;

    console.log('  Running mobile audit...');
    mobileReport = await runLighthouse(url, 'mobile');
    fs.writeFileSync(
      path.join(ROOT, 'test-results/lighthouse-mobile.json'),
      JSON.stringify(mobileReport, null, 2)
    );

    console.log('  Running desktop audit...');
    desktopReport = await runLighthouse(url, 'desktop');
    fs.writeFileSync(
      path.join(ROOT, 'test-results/lighthouse-desktop.json'),
      JSON.stringify(desktopReport, null, 2)
    );
  } finally {
    server.close();
  }

  printLighthouseScores('Mobile', mobileReport);
  printLighthouseScores('Desktop', desktopReport);
  console.log('\n  Reports saved to test-results/');

  checkLighthouseThresholds('Mobile', mobileReport);
  checkLighthouseThresholds('Desktop', desktopReport);

  printSummary(true);
}

function printSummary(withLighthouse = false) {
  console.log('\n' + '='.repeat(50));
  console.log(' PIPELINE PASSED');
  console.log(`   lint + unit tests  ok`);
  console.log(`   build (CSS + JS)   ok`);
  console.log(`   performance budget ok`);
  if (withLighthouse) console.log(`   lighthouse         ok`);
  console.log('='.repeat(50) + '\n');
}

main().catch(err => {
  console.error(`\nPIPELINE FAILED: ${err.message}`);
  process.exit(1);
});
