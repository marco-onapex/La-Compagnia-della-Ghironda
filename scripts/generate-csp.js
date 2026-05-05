#!/usr/bin/env node
/**
 * scripts/generate-csp.js
 *
 * Reads index.html, extracts every inline <script> and <style>, computes
 * SHA-256 hashes, and rewrites the Content-Security-Policy meta tag with the
 * full strict policy. Run automatically as the last step of `npm run build`
 * so the hashes are always in sync with what was just built.
 *
 * Policy directives:
 *   default-src 'self'                — fallback for any directive not set
 *   script-src 'self' <sha256-…>      — only same-origin scripts and the
 *                                       inline blocks we hash here
 *   style-src 'self' <sha256-…>       — same; eliminates 'unsafe-inline'
 *   img-src 'self' data:              — favicon is a data: SVG
 *   font-src 'self'                   — fonts are all self-hosted woff2
 *   connect-src 'self'                — fetch/XHR/Beacon to same origin only
 *   object-src 'none'                 — no <object>/<embed>/<applet>
 *   frame-ancestors 'none'            — clickjacking protection
 *   base-uri 'self'                   — prevent <base> hijack
 *   form-action 'none'                — site has no forms
 *   manifest-src 'self'               — PWA manifest is same-origin
 *   upgrade-insecure-requests         — auto-upgrade any http: URL to https:
 *
 * 'unsafe-inline' is intentionally NOT present anywhere. The inline <style>
 * with the critical CSS is allowed exclusively via its sha256 hash, computed
 * here and embedded in the CSP at build time. Any drift between the hash and
 * the actual inline content (e.g. someone hand-edits the HTML after build)
 * causes the browser to refuse the style — exactly the contract we want.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* Round 20 (option B): operate on the built `.deploy/index.html`,
   which already has the inline critical CSS injected by build-css.js.
   The source `index.html` keeps the placeholder `'sha256-...='` form
   and is never mutated. */
const HTML_PATH = path.join(__dirname, '..', '.deploy', 'index.html');

const rawHtml = fs.readFileSync(HTML_PATH, 'utf8');
// Comment-stripped buffer used ONLY for inline-tag detection. The original
// rawHtml is what gets written back — stripping comments persistently would
// erase author commentary on every build.
const htmlNoComments = rawHtml.replaceAll(/<!--[\s\S]*?-->/g, '');

// Inline <script> tags — every inline script is hashed, including
// `application/ld+json`. Browsers don't execute JSON-LD as JS so the hash
// is not strictly required; including it removes a refactor footgun (a
// future typo in `application/ld+json` → `application/javascript` would
// otherwise let an arbitrary inline script run unhashed).
const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
// Inline <style> tags
const INLINE_STYLE_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;

function hashesOf(re) {
  const out = [];
  let m;
  while ((m = re.exec(htmlNoComments)) !== null) {
    const content = m[1];
    if (content.length === 0) {
      continue;
    }
    const digest = crypto.createHash('sha256').update(content, 'utf8').digest('base64');
    out.push(`'sha256-${digest}'`);
  }
  return out;
}

const scriptHashes = hashesOf(INLINE_SCRIPT_RE);
const styleHashes = hashesOf(INLINE_STYLE_RE);
console.log(`[CSP] inline scripts hashed: ${scriptHashes.length}`);
console.log(`[CSP] inline styles  hashed: ${styleHashes.length}`);

const directives = [
  "default-src 'self'",
  ['script-src', "'self'", ...scriptHashes].join(' '),
  ['style-src', "'self'", ...styleHashes].join(' '),
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  // worker-src explicit (rather than relying on the default-src fallback,
  // which a few CSP implementations have historically gotten wrong) — the
  // service worker registered in main.js is same-origin.
  "worker-src 'self'",
  "object-src 'none'",
  // frame-ancestors is intentionally OMITTED here: the directive is
  // silently ignored when delivered via <meta http-equiv>. Clickjacking
  // protection must be applied via HTTP response header on the deploy
  // host (e.g. `X-Frame-Options: DENY`).
  "base-uri 'self'",
  "form-action 'none'",
  // manifest-src 'self' — required for the same-origin
  // manifest.webmanifest referenced from index.html.
  "manifest-src 'self'",
  // upgrade-insecure-requests intentionally OMITTED:
  // 1. The site loads only same-origin assets ('self'), so there is nothing
  //    to upgrade — every request is already HTTPS on GitHub Pages.
  // 2. WebKit honours the directive even on localhost, breaking e2e tests
  //    by retrying http://localhost:8000/dist/main.min.js as https: (SSL
  //    error → script never loads → IntersectionObserver never runs).
  // 3. HSTS on the host already covers the policy job in production.
];
const csp = directives.join('; ');

const META_RE =
  /<meta\s+http-equiv\s*=\s*"Content-Security-Policy"\s+content\s*=\s*"[^"]*"\s*\/?>/i;
if (!META_RE.test(rawHtml)) {
  console.error('[CSP] ERROR: <meta http-equiv="Content-Security-Policy"> not found in index.html');
  process.exit(1);
}
const replacement = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
const updated = rawHtml.replace(META_RE, replacement);
fs.writeFileSync(HTML_PATH, updated, 'utf8');
console.log('[CSP] index.html updated with strict policy.');
