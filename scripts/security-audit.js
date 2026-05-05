#!/usr/bin/env node
/**
 * Security Audit
 *
 * Three-layer scan:
 *   1. `npm audit --audit-level=moderate` — dependency CVE check
 *   2. Static pattern scan over `js/` for dangerous APIs (eval,
 *      innerHTML, document.write, etc.)
 *   3. HTTPS enforcement + CSP quality on the rendered HTML
 *
 * Round-21 cleanup: every path lookup is anchored to this script's
 * directory (NOT `process.cwd()`). Invoking the audit from a subdir
 * previously walked an empty `js/` and silently false-passed.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let failures = 0;

function fail(msg) {
  console.error(`  FAIL ${msg}`);
  failures++;
}
function ok(msg) {
  console.log(`  ok   ${msg}`);
}

// ─── 1. Dependency CVE scan ──────────────────────────────────────────────────
// Threshold = `moderate` — same as `.npmrc audit-level` and SECURITY.md;
// keeps the dev install, this script, and the docs in sync.
console.log('\nDependency audit (npm audit --audit-level=moderate)');
try {
  execSync('npm audit --audit-level=moderate', { stdio: 'inherit' });
  ok('no moderate-or-higher CVEs in dependencies');
} catch {
  fail('moderate-or-higher CVEs detected — run: npm audit fix');
}

// ─── 2. Static code analysis ─────────────────────────────────────────────────
// Scans only js/ (production runtime). scripts/ is dev tooling and not shipped.
console.log('\nStatic code analysis (js/)');

const JS_DIR = path.join(ROOT, 'js');

const DANGEROUS = [
  // Arbitrary code execution
  { pattern: /\beval\s*\(/, label: 'eval() — arbitrary code execution risk' },
  { pattern: /\bnew\s+Function\s*\(/, label: 'new Function() — arbitrary code execution risk' },
  // String-argument timers (eval-equivalent), allowing optional whitespace or newlines before (
  { pattern: /setTimeout\s*\(\s*['"`]/, label: 'setTimeout with string — eval-equivalent' },
  { pattern: /setInterval\s*\(\s*['"`]/, label: 'setInterval with string — eval-equivalent' },
  // Direct DOM write methods — XSS risk
  { pattern: /\bdocument\.write\s*\(/, label: 'document.write() — XSS risk' },
  // innerHTML / outerHTML assignment (catches +=, =, and multi-space variants; excludes literal string constants starting with < for template whitelisting)
  { pattern: /\.innerHTML\s*[+]?=\s*(?![`'"]<)/, label: 'innerHTML assignment — potential XSS' },
  { pattern: /\.outerHTML\s*[+]?=\s*(?![`'"]<)/, label: 'outerHTML assignment — potential XSS' },
  // insertAdjacentHTML with a non-literal first argument (position) followed by non-literal content
  {
    pattern: /\.insertAdjacentHTML\s*\(/,
    label: 'insertAdjacentHTML() — potential XSS, verify all arguments are sanitised',
  },
];

function walkJs(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      return walkJs(full);
    }
    return e.name.endsWith('.js') ? [full] : [];
  });
}

let dangerousFound = false;
for (const file of walkJs(JS_DIR)) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file);
  for (const { pattern, label } of DANGEROUS) {
    if (pattern.test(src)) {
      fail(`${rel}: ${label}`);
      dangerousFound = true;
    }
  }
}
if (!dangerousFound) {
  ok('no dangerous patterns in source code');
}

// ─── 3. HTTPS enforcement ─────────────────────────────────────────────────────
/* Round 20 (option B): prefer the BUILT artefact (`.deploy/index.html`)
   so the audit measures the bytes that actually ship — including the
   real CSP `'sha256-...'` hashes injected by build:csp. Source
   `index.html` carries `'sha256-PLACEHOLDER='` until build runs;
   auditing only the placeholder would mask a build-chain regression
   that left a real `'unsafe-inline'` on the deploy. Fall back to the
   source file when no build is present so the audit still runs in
   pre-build environments (catches XSS sinks etc. on uncompiled JS). */
const DEPLOY_HTML = path.join(ROOT, '.deploy', 'index.html');
const SOURCE_HTML = path.join(ROOT, 'index.html');
const HTML_PATH = fs.existsSync(DEPLOY_HTML) ? DEPLOY_HTML : SOURCE_HTML;
const HTML_LABEL = HTML_PATH === DEPLOY_HTML ? '.deploy/index.html (built)' : 'index.html (source)';

console.log(`\nHTTPS enforcement (${HTML_LABEL})`);
const html = fs.readFileSync(HTML_PATH, 'utf8');
// Exclude XML/SVG namespace identifiers (www.w3.org) — not actual HTTP requests
const httpMatches = [...html.matchAll(/\bhttp:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org)/g)];
if (httpMatches.length > 0) {
  fail(`index.html: ${httpMatches.length} non-HTTPS URL(s) found`);
} else {
  ok('all external URLs use HTTPS');
}

// ─── 4. CSP quality ───────────────────────────────────────────────────────────
// Extract the full <meta> tag first (attribute-order-independent), then read content=.
console.log('\nContent-Security-Policy');
const cspTagMatch = html.match(/<meta\s[^>]*http-equiv="Content-Security-Policy"[^>]*>/i);
if (!cspTagMatch) {
  fail('CSP meta tag missing from index.html');
} else {
  const contentMatch = cspTagMatch[0].match(/content="([^"]+)"/i);
  const csp = contentMatch ? contentMatch[1] : '';
  ok('CSP meta tag present');
  if (/script-src[^;]*'unsafe-eval'/.test(csp)) {
    fail("CSP script-src contains 'unsafe-eval' — arbitrary code execution risk");
  } else {
    ok("CSP script-src does not allow 'unsafe-eval'");
  }
  if (/script-src[^;]*\*/.test(csp) || /default-src[^;]*\*/.test(csp)) {
    fail('CSP contains wildcard (*) in script-src or default-src');
  } else {
    ok('CSP does not use wildcard in script/default source');
  }
  if (/'unsafe-inline'/.test(csp) && !/script-src[^;]*'sha256-/.test(csp)) {
    fail("CSP uses 'unsafe-inline' without sha256 hashes — XSS risk");
  } else {
    ok('CSP inline script policy is hash-locked or unsafe-inline is absent');
  }
}

// ─── Result ───────────────────────────────────────────────────────────────────
console.log('');
if (failures > 0) {
  console.error(`Security audit FAILED — ${failures} issue(s) found`);
  process.exit(1);
}
console.log('All security checks passed');
