#!/usr/bin/env node

/**
 * Complete Validation Pipeline with Lighthouse
 *
 * Single command that:
 * 1. Runs unit tests
 * 2. Runs linting (HTML/CSS/JS)
 * 3. Checks performance budget
 * 4. Builds assets
 * 5. Starts HTTP server
 * 6. Runs Lighthouse audit via Node.js API (no shell quoting issues)
 * 7. Shows final report
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Helper to run commands synchronously
const runCommand = (label, cmd) => {
  console.log(`  ${label}...`);
  try {
    execSync(cmd, { cwd: projectRoot, stdio: 'inherit' });
    return true;
  } catch {
    console.error(`\u274C ${label} failed`);
    return false;
  }
};

// Start a minimal local HTTP server serving the project root
const startServer = () => new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const safePath = req.url.split('?')[0].replace(/\.\./g, '');
    const file = path.join(projectRoot, safePath === '/' ? 'index.html' : safePath);
    try {
      const content = fs.readFileSync(file);
      const ext = path.extname(file);
      const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  server.listen(8000, '127.0.0.1', () => resolve(server));
  server.on('error', reject);
});

async function main() {
  console.log('\u{1F680} Starting complete validation pipeline with Lighthouse...\n');

  // Step 1: Unit Tests
  console.log('\u{1F4E6} Step 1: Running tests...');
  if (!runCommand('Unit Tests', 'npm run test:unit')) process.exit(1);
  console.log('\u2705 Tests passed\n');

  // Step 2: Linting
  console.log('\u{1F4CB} Step 2: Linting (HTML/CSS/JS)...');
  if (
    !runCommand('HTML', 'npm run lint:html') ||
    !runCommand('CSS', 'npm run lint:css') ||
    !runCommand('JavaScript', 'npm run lint:js')
  ) process.exit(1);
  console.log('\u2705 Linting passed\n');

  // Step 3: Performance Budget
  console.log('Step 3: Performance budget check...');
  if (!runCommand('Bundle size', 'npm run audit:performance')) process.exit(1);
  console.log('Performance budget met\n');

  // Step 4: Build Assets
  console.log('Step 4: Building assets...');
  if (
    !runCommand('CSS minified', 'npm run build:css') ||
    !runCommand('JS minified', 'npm run build:js')
  ) process.exit(1);
  execSync('npm run size-report', { cwd: projectRoot, stdio: 'inherit' });
  console.log('Build complete\n');

  // Step 5: Start server
  console.log('Step 5: Starting local server...');
  const server = await startServer();
  console.log('Server running on http://localhost:8000\n');

  // Step 6: Lighthouse (Node.js API — no shell, no quoting issues)
  const reportPath = path.join(projectRoot, 'test-results', 'lighthouse.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  console.log('Step 6: Running Lighthouse audit...');
  console.log('\u23F3 This takes ~2-3 minutes, please wait...\n');

  let chrome;
  try {
    chrome = await launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const result = await lighthouse('http://localhost:8000', {
      logLevel: 'error',
      output: 'json',
      port: chrome.port,
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });

    await chrome.kill();
    chrome = null;
    server.close();

    fs.writeFileSync(reportPath, result.report, 'utf-8');

    const report = JSON.parse(result.report);
    const scores = report.categories;
    const audits = report.audits;

    console.log('\u2501'.repeat(42));
    console.log('\u2705 FULL VALIDATION PIPELINE COMPLETED');
    console.log('\u2501'.repeat(42));
    console.log('');
    console.log('\u{1F4CA} Final Lighthouse Scores:');
    console.log(`  \u26A1 Performance:     ${Math.round(scores.performance.score * 100)}/100`);
    console.log(`  \u267F Accessibility:   ${Math.round(scores.accessibility.score * 100)}/100`);
    console.log(`  \u{1F4CB} Best Practices:  ${Math.round(scores['best-practices'].score * 100)}/100`);
    console.log(`  \u{1F50D} SEO:             ${Math.round(scores.seo.score * 100)}/100`);
    console.log('');
    console.log('\u26A1 Core Web Vitals:');
    console.log(`  FCP: ${Math.round(audits['first-contentful-paint'].numericValue)} ms`);
    console.log(`  LCP: ${Math.round(audits['largest-contentful-paint'].numericValue)} ms`);
    console.log(`  CLS: ${audits['cumulative-layout-shift'].numericValue.toFixed(3)}`);
    console.log('');
    console.log('\u{1F4C4} Full report saved to: test-results/lighthouse.json');
    console.log('\u2501'.repeat(42) + '\n');

  } catch (error) {
    if (chrome) await chrome.kill().catch(() => {});
    server.close();
    console.error('\u274C Lighthouse error:', error.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\u274C Pipeline error:', err.message);
  process.exit(1);
});
