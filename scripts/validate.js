#!/usr/bin/env node

/**
 * Full Validation Pipeline
 *
 * Phases (each waits for the previous to succeed):
 *   1. Lint + Unit Tests                    — in parallel
 *   2. Build (`npm run build` — full round-20 chain)
 *   3. Lighthouse audit (mobile + desktop)  — only with --lighthouse flag (~3 min)
 *
 * Round 20 (option B): the embedded HTTP server in phase 3 serves
 * from `.deploy/`, the build artefact populated by phase 2. Serving
 * from the project root would let Lighthouse audit source files
 * (with `<!-- CSS:BEGIN --><!-- CSS:END -->` placeholders, no inline
 * critical CSS, no hashed CSP, no `?v=` cache-bust) — every metric
 * would diverge from what the deployed site actually ships.
 *
 * Phase 2 is the canonical `npm run build` rather than a partial
 * manual chain. The full chain runs build:css + build:js +
 * build:assets + build:sitemap + build:cache-bust + build:csp +
 * build:strip + size-report + audit:performance + docs:numbers — a
 * partial chain (the pre-round-20 shape) would skip build:assets
 * and break build:cache-bust because the composite hash now reads
 * font/image bytes from .deploy/.
 *
 * Usage:
 *   node scripts/validate.js
 *   node scripts/validate.js --lighthouse
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';

import { findRepoRoot } from './lib/repo-root.js';
import { killPort } from './port-utils.js';

const ROOT = findRepoRoot();
/* DOC_ROOT — what the embedded HTTP server in phase 3 actually
   serves. Round 20: this is `.deploy/` (the build artefact), NEVER
   the source tree. See module docstring for rationale. */
const DOC_ROOT = path.join(ROOT, '.deploy');
const PORT = 8001; // intentionally different from dev-server (8000) to avoid port conflicts
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
 * Run tasks concurrently. Collects ALL failures before rejecting so none are swallowed.
 */
function runParallel(tasks) {
  return Promise.allSettled(
    tasks.map(
      ({ label, cmd }) =>
        new Promise((resolve, reject) => {
          const [bin, ...args] = cmd.split(' ');
          const child = spawn(bin, args, { cwd: ROOT, stdio: 'inherit', shell: true });
          child.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`"${label}" exited with code ${code}`));
            }
          });
          child.on('error', (err) => reject(new Error(`"${label}": ${err.message}`)));
        }),
    ),
  ).then((results) => {
    const failures = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
    if (failures.length > 0) {
      throw new Error(failures.join('\n'));
    }
    return undefined;
  });
}

/** Start a static HTTP server with gzip + cache headers on PORT. Returns the server instance. */
function startServer() {
  return new Promise((resolve, reject) => {
    const MIME = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
      '.ttf': 'font/ttf',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    };
    const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg']);
    // Long cache TTL for versioned assets; no-cache for HTML
    const CACHE = {
      '.html': 'no-cache',
      default: 'public, max-age=31536000, immutable',
    };

    const server = http.createServer((req, res) => {
      /* Path-traversal hardening:
         - decodeURIComponent first so %2e%2e (URL-encoded "..") is normalised
           and can't bypass the literal ".." filter.
         - path.resolve() collapses any remaining "../" segments to an
           absolute path, then we assert it stays inside DOC_ROOT before reading.
         A request like /%2e%2e/%2e%2e/etc/passwd would otherwise exit DOC_ROOT
         even after the naïve `replaceAll('..')` sanitiser. */
      let urlPath;
      try {
        urlPath = decodeURIComponent(req.url.split('?')[0]);
      } catch {
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }
      const safePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const file = path.resolve(DOC_ROOT, safePath);
      if (!file.startsWith(DOC_ROOT + path.sep) && file !== DOC_ROOT) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      try {
        const ext = path.extname(file).toLowerCase();
        const mime = MIME[ext] ?? 'application/octet-stream';
        const cache = CACHE[ext] ?? CACHE.default;
        const acceptsGzip = /gzip/.test(req.headers['accept-encoding'] || '');
        const canGzip = COMPRESSIBLE.has(ext) && acceptsGzip;

        const content = fs.readFileSync(file);
        const headers = { 'Content-Type': mime, 'Cache-Control': cache };
        if (canGzip) {
          headers['Content-Encoding'] = 'gzip';
        }
        res.writeHead(200, headers);

        if (canGzip) {
          zlib.gzip(content, (err, compressed) => {
            if (err) {
              res.end(content);
            } else {
              res.end(compressed);
            }
          });
        } else {
          res.end(content);
        }
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    killPort(PORT);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

/** Run a Lighthouse audit and return the parsed report. */
async function runLighthouse(url, formFactor) {
  // Dynamic import — lighthouse is an optional dependency for this step
  const { default: lighthouse } = await import('lighthouse');
  const { default: desktopConfig } = await import('lighthouse/core/config/desktop-config.js');
  const { launch } = await import('chrome-launcher');

  const chrome = await launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const isDesktop = formFactor === 'desktop';
    /** @type {import('lighthouse').Flags} */
    const flags = {
      logLevel: 'error',
      output: 'json',
      port: chrome.port,
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    };
    if (!isDesktop) {
      // Mobile: use explicit mobile screen emulation with default mobile throttling
      flags.formFactor = 'mobile';
      flags.screenEmulation = {
        mobile: true,
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        disabled: false,
      };
    }
    // Desktop: use the desktop config preset (desktopDense4G throttling: 40ms RTT, 10Mbps, 1x CPU)
    const config = isDesktop ? desktopConfig : undefined;
    const result = await lighthouse(url, flags, config);
    if (!result) {
      throw new Error('Lighthouse returned no result');
    }
    /* `output: 'json'` always yields a string report, but the lighthouse
       type signature is the union string|string[] (it supports multiple
       output formats simultaneously). Coerce to string for JSON.parse. */
    const report = Array.isArray(result.report) ? result.report[0] : result.report;
    return JSON.parse(report);
  } finally {
    try {
      chrome.kill();
    } catch {
      /* ignore */
    }
  }
}

const LIGHTHOUSE_THRESHOLDS = {
  performance: 100,
  accessibility: 100,
  'best-practices': 100,
  seo: 100,
};

function checkLighthouseThresholds(label, report) {
  const failures = [];
  for (const [cat, min] of Object.entries(LIGHTHOUSE_THRESHOLDS)) {
    const score = Math.round(report.categories[cat].score * 100);
    if (score < min) {
      failures.push(`    ${cat}: ${score} < ${min} (required)`);
    }
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
  if (a['first-contentful-paint']) {
    console.log(
      `    FCP: ${Math.round(a['first-contentful-paint'].numericValue)} ms  ` +
        `LCP: ${Math.round(a['largest-contentful-paint'].numericValue)} ms  ` +
        `CLS: ${a['cumulative-layout-shift'].numericValue.toFixed(3)}`,
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TOTAL = RUN_LIGHTHOUSE ? 3 : 2;

async function main() {
  console.log('='.repeat(50));
  console.log(' Full Validation Pipeline');
  if (RUN_LIGHTHOUSE) {
    console.log(' (Lighthouse enabled)');
  }
  console.log('='.repeat(50));

  // ── Phase 1: Lint + Unit Tests (parallel) ──────────────────────────────────
  step(1, TOTAL, 'Lint (HTML+CSS+JS) + Unit Tests  [parallel]');
  await runParallel([
    { label: 'lint', cmd: 'npm run lint:parallel' },
    { label: 'unit-tests', cmd: 'npm run test:unit' },
  ]);
  console.log('  ok  lint + unit tests');

  // ── Phase 2: Build (canonical full chain) ─────────────────────────────────
  /* `npm run build` runs the full round-20 chain end-to-end:
       build:css + build:js (parallel)
       → build:assets (mirror fonts/images/sw.js into .deploy/)
       → build:sitemap → build:cache-bust → build:csp
       → build:strip → size-report → audit:performance → docs:numbers
     A partial chain here would skip build:assets, which breaks
     build:cache-bust because the composite hash now reads .deploy/
     font + image bytes. The full chain also runs the perf-budget
     gate as its penultimate step, so a separate phase 3 is no
     longer necessary. */
  step(2, TOTAL, 'Build (`npm run build` — full round-20 chain)');
  run('npm run build');
  console.log('  ok  build + size-report + perf-budget + docs:numbers');

  if (!RUN_LIGHTHOUSE) {
    printSummary();
    return;
  }

  // ── Phase 3: Lighthouse (mobile + desktop, sequential) ────────────────────
  step(3, TOTAL, 'Lighthouse audit  (mobile + desktop)');
  console.log('  This takes ~3-5 min...');

  const server = await startServer();
  console.log(`  server on http://localhost:${PORT}`);

  /* SIGINT/SIGTERM cleanup: a Ctrl+C mid-Lighthouse otherwise leaves a
     headless Chrome process alive (chrome-launcher detaches it) AND
     keeps PORT bound. Close the server explicitly and forward the
     signal exit code (128 + signal). */
  const cleanup = (signal) => {
    try {
      server.close();
    } catch {
      /* already closed */
    }
    process.exit(128 + (signal === 'SIGTERM' ? 15 : 2));
  };
  process.once('SIGINT', () => cleanup('SIGINT'));
  process.once('SIGTERM', () => cleanup('SIGTERM'));

  fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });

  let mobileReport, desktopReport;

  try {
    const url = `http://127.0.0.1:${PORT}`;

    console.log('  Running mobile audit...');
    mobileReport = await runLighthouse(url, 'mobile');
    fs.writeFileSync(
      path.join(ROOT, 'test-results/lighthouse-mobile.json'),
      JSON.stringify(mobileReport, null, 2),
    );

    console.log('  Running desktop audit...');
    desktopReport = await runLighthouse(url, 'desktop');
    fs.writeFileSync(
      path.join(ROOT, 'test-results/lighthouse-desktop.json'),
      JSON.stringify(desktopReport, null, 2),
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
  console.log(`   lint + unit tests                       ok`);
  console.log(`   build (full round-20 chain → .deploy/)  ok`);
  if (withLighthouse) {
    console.log(`   lighthouse (mobile + desktop)           ok`);
  }
  console.log('='.repeat(50) + '\n');
}

main().catch((err) => {
  console.error(`\nPIPELINE FAILED: ${err.message}`);
  process.exit(1);
});
