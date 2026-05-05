#!/usr/bin/env node
/**
 * Enforce Lighthouse score thresholds.
 *
 * Reads a Lighthouse JSON report and exits non-zero if any category falls
 * below its threshold. Intended for CI:
 *   - PRs:     block on violations          (IS_PR=true)
 *   - pushes:  log a warning but pass       (IS_PR=false, BLOCKING unset)
 *   - release: ALWAYS block on violations   (BLOCKING=true)
 *
 * `BLOCKING=true` is authoritative regardless of IS_PR — the release
 * pipeline (`.github/workflows/release.yml`) sets it explicitly so a
 * release tag never ships with a sub-100 score, even when triggered
 * from a non-PR dispatch.
 *
 * Usage:
 *   IS_PR=true   node scripts/enforce-lighthouse.js [report.json]
 *   BLOCKING=true node scripts/enforce-lighthouse.js [report.json]
 *
 * Default report path: ./lighthouse-report.report.json
 */

import fs from 'node:fs';

const REPORT_PATH = process.argv[2] || './lighthouse-report.report.json';

const THRESHOLDS = {
  performance: 100,
  accessibility: 100,
  'best-practices': 100,
  seo: 100,
};

if (!fs.existsSync(REPORT_PATH)) {
  console.error(`[ERROR] Lighthouse report not found at ${REPORT_PATH}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
const cats = report.categories;

if (!cats) {
  console.error('[ERROR] Lighthouse report is missing the `categories` field');
  process.exit(1);
}

/* Validate every category we plan to enforce — Lighthouse occasionally drops
   a category if it errors during run (e.g. unreachable resource). Failing
   loud here is preferable to silently scoring NaN and passing the gate. */
let failed = false;
for (const [cat, min] of Object.entries(THRESHOLDS)) {
  const node = cats[cat];
  if (!node || typeof node.score !== 'number') {
    console.error(`[ERROR] Lighthouse report is missing or malformed for category: ${cat}`);
    process.exit(1);
  }
  const score = Math.round(node.score * 100);
  const ok = score >= min;
  console.log(`  ${ok ? 'ok ' : 'FAIL'} ${cat}: ${score} (min: ${min})`);
  if (!ok) {
    failed = true;
  }
}

const isPR = process.env.IS_PR === 'true';
const isBlocking = process.env.BLOCKING === 'true' || isPR;
if (failed && isBlocking) {
  console.error('\nThreshold violations block this run.');
  process.exit(1);
} else if (failed) {
  console.warn('\nThreshold violations detected on push — non-blocking (monitoring).');
} else {
  console.log('\nAll thresholds met.');
}
