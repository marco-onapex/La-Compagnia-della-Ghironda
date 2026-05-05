/**
 * Dev server with gzip compression, file watching, and livereload.
 *
 * Round 20 (option B): the server's document root is `.deploy/`, the
 * built artefact directory pushed to `gh-pages` in production. Source
 * files (`index.html`, `css/`, `js/`, `sw.js`, fonts, images) live in
 * the project root and are copied / compiled into `.deploy/` by the
 * build chain. The watcher observes the source roots and re-runs the
 * relevant build step on every change so livereload still serves the
 * just-built copy.
 *
 * Run `npm run build` once before `npm run serve` so `.deploy/` is
 * fully populated; the watcher only re-runs the per-file builders, not
 * the full chain (no CSP regen, no cache-bust). For a deploy-faithful
 * preview run `npm run build && npm run serve`.
 *
 * Livereload works via Server-Sent Events (SSE):
 *   - GET /livereload       → SSE stream that fires "reload" on any file change
 *   - GET /livereload-client.js → tiny client that listens and reloads the page
 *
 * The client script is injected before </body> in every HTML response so
 * no manual <script> tag is needed in index.html. The script is served as an
 * external same-origin resource → passes CSP script-src 'self'.
 *
 * Usage: node scripts/dev-server.js [port]
 */

import { spawn } from 'node:child_process';
import { createReadStream, existsSync, watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve as resolvePath, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createGzip, gzip as gzipCb } from 'node:zlib';

import { findRepoRoot } from './lib/repo-root.js';
import { killPort } from './port-utils.js';

const gzipAsync = promisify(gzipCb);

const PORT = Number.parseInt(process.argv[2] || '8000', 10);
/* PROJECT_ROOT — repository root (used for spawning builds and
   anchoring the file watchers). DOC_ROOT — `.deploy/` (used as the
   HTTP document root). The two MUST stay separate: serving from the
   project root would expose `node_modules/`, `tests/`, source CSS,
   etc. — every one of which is excluded from the deployed artefact. */
const PROJECT_ROOT = findRepoRoot();
const ROOT = join(PROJECT_ROOT, '.deploy');
const TEST_MODE = !!process.env.TEST_MODE;

/* Fail fast if `.deploy/` hasn't been built. Without this guard the
   server would happily start, accept connections, and return HTTP
   404 for every request — including `/`. Playwright's webServer
   waits only for "any HTTP response", so it would treat the server
   as ready, then every test would fail with a 404 in
   page.goto('/'). The same trap catches anyone running `npm run
   serve` directly without first running `npm run build`. The
   explicit error here points the user straight at the fix. */
if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(
    '\n[dev-server] .deploy/index.html not found.\n' +
      '   The dev server serves the BUILT artefact, not source.\n' +
      '   Run `npm run build` first to populate .deploy/.\n' +
      '   (Round 20 source/deploy split: see BUILD.md.)\n',
  );
  process.exit(1);
}

killPort(PORT);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg']);

// ─── Livereload SSE clients ────────────────────────────────────────────────────

const lrClients = new Set();

function broadcast(event) {
  for (const res of lrClients) {
    try {
      res.write(`data: ${event}\n\n`);
    } catch {
      lrClients.delete(res);
    }
  }
}

// ─── Build-then-reload ────────────────────────────────────────────────────────

/** Determine which build script to run based on the changed file path. */
function buildScript(filename) {
  const f = filename.replaceAll('\\', '/');
  /* CSS module change OR source `index.html` change → re-run build-css
     (which also re-injects the inline critical CSS into the deployed
     HTML copy). */
  if (f.startsWith('css/') || f === 'build-css.js' || f === 'index.html') {
    return 'build-css.js';
  }
  if (f.startsWith('js/') || f === 'build-js.js') {
    return 'build-js.js';
  }
  /* Static assets that get mirrored into `.deploy/` verbatim — sw.js,
     manifest, robots, humans, fonts, images, .well-known. Re-run the
     copy step to refresh the deployed copy. */
  if (
    f === 'sw.js' ||
    f === 'manifest.webmanifest' ||
    f === 'robots.txt' ||
    f === 'humans.txt' ||
    f === 'LICENSE' ||
    f.startsWith('fonts/') ||
    f.startsWith('images/') ||
    f.startsWith('.well-known/')
  ) {
    return 'scripts/copy-static-assets.js';
  }
  return null;
}

function runBuild(script) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [script], { cwd: PROJECT_ROOT, stdio: 'inherit' });
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)),
    );
    child.on('error', reject);
  });
}

/* Watch only the source roots that can trigger a rebuild or reload.
   The watch base is PROJECT_ROOT (source tree), not ROOT (`.deploy/`).
   Avoiding `fs.watch(PROJECT_ROOT, { recursive: true })` removes two
   failure modes:
   1. Recursive watch on Linux is supported since Node 20 but historically
      unreliable for nested directories created/removed at runtime
      (sub-watcher leaks, missing events). Explicit per-directory watchers
      are deterministic on every platform.
   2. Watching PROJECT_ROOT recursively would also observe `.deploy/`
      itself (creating an infinite rebuild loop), `node_modules/`,
      `coverage/`, `test-results/`, etc. — and any regex-based ignore
      here is a denial-of-service waiting to happen the day a tool
      writes a thousand files into one of those dirs. */
const WATCH_TARGETS = [
  { dir: 'css', recursive: true },
  { dir: 'js', recursive: true },
  { dir: 'fonts', recursive: false },
  { dir: 'images', recursive: false },
  { dir: '.well-known', recursive: false },
  // Root-level (non-recursive) — index.html, sw.js, build-*.js, etc.
  { dir: '.', recursive: false },
];

let debounceTimer = null;
/* Round-21 fix: previous code had a single global timer + tracked
   only the LAST changed filename. If a dev saved a CSS file and a
   JS file inside the debounce window (120 ms), only the second
   change's build script ran (last-write-wins), leaving the other
   bundle stale until the next save. This Set collects every script
   that needs to run, then drains them all on debounce flush. */
const pendingScripts = new Set();
let pendingPaths = [];

const handleChange = (filename) => {
  if (!filename) {
    return;
  }
  /* Defensive: even with scoped watchers, a change in `.deploy/` or
     `dist/` could leak through (e.g. if the build pipeline edits a
     sibling file we observe). Refuse to rebuild on those, .map files,
     or hidden dot-files. Letting `.deploy/` events through would
     create an infinite rebuild loop because every build writes there. */
  if (
    filename.endsWith('.map') ||
    filename.startsWith('.deploy' + sep) ||
    filename.startsWith('.deploy/') ||
    filename.startsWith('dist' + sep) ||
    filename.startsWith('dist/') ||
    filename.startsWith('.')
  ) {
    return;
  }

  const script = buildScript(filename);
  pendingPaths.push(filename);
  if (script) {
    pendingScripts.add(script);
  }

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const scripts = [...pendingScripts];
    const paths = pendingPaths;
    pendingScripts.clear();
    pendingPaths = [];

    const summary =
      paths.length === 1
        ? paths[0]
        : `${paths.length} files (${[...new Set(paths)].slice(0, 3).join(', ')}${paths.length > 3 ? ', ...' : ''})`;
    console.log(
      `[livereload] changed: ${summary}${scripts.length ? ` → building ${scripts.join(' + ')}` : ''}`,
    );
    /* Build sequentially: parallel `Promise.all` would have
       build:css + build:js write to .deploy/ concurrently. Each
       is fast (~100-200 ms) and they DO modify disjoint paths,
       but generic-script ordering (e.g. copy-static-assets after
       build:css for the inline-CSS path) is preserved by serial. */
    for (const s of scripts) {
      try {
        await runBuild(s);
      } catch (err) {
        console.error(`[livereload] ${s} failed: ${err.message}`);
        return; // don't reload with broken build
      }
    }
    broadcast('reload');
  }, 120);
};

for (const { dir, recursive } of WATCH_TARGETS) {
  const target = dir === '.' ? PROJECT_ROOT : join(PROJECT_ROOT, dir);
  if (!existsSync(target)) {
    continue;
  }
  watch(target, { recursive }, (_event, filename) => {
    if (!filename) {
      return;
    }
    /* Re-prefix the relative filename so buildScript() sees `js/foo.js`
       even when fs.watch reports just `foo.js` (recursive=false case). */
    const prefixed = dir === '.' ? filename : `${dir}${sep}${filename}`;
    handleChange(prefixed);
  });
}

// ─── Livereload client script (served as /livereload-client.js) ───────────────

const LIVERELOAD_CLIENT = `(function(){
  var es;
  function connect(){
    es=new EventSource('/livereload');
    es.onmessage=function(e){if(e.data==='reload'){location.reload();}};
    es.onerror=function(){es.close();setTimeout(connect,2000);};
  }
  connect();
  window.addEventListener('beforeunload',function(){if(es)es.close();});
})();`;

// Injected into every HTML response
const LIVERELOAD_TAG = '<script src="/livereload-client.js"></script>';

// ─── HTTP server ──────────────────────────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  /* Path-traversal hardening:
     - decodeURIComponent normalises %2e%2e (URL-encoded "..") so the
       string-level checks downstream see the literal "..".
     - path.resolve() collapses any remaining "../" segments to an
       absolute path, then we assert the resolved path stays inside
       ROOT before opening the file. A request such as
         /%2e%2e/%2e%2e/etc/passwd
       would otherwise resolve to a parent of ROOT and `existsSync` would
       happily return true for any real file the worker can read. */
  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // SSE endpoint — disabled in test mode (keeps networkidle reachable)
  if (pathname === '/livereload') {
    if (TEST_MODE) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.writeHead(200);
    res.write(': connected\n\n');
    lrClients.add(res);
    req.on('close', () => lrClients.delete(res));
    return;
  }

  // Livereload client script
  if (pathname === '/livereload-client.js') {
    if (TEST_MODE) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.writeHead(200);
    res.end(LIVERELOAD_CLIENT);
    return;
  }

  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  /* path.resolve normalises "..", then assert prefix-containment
     against ROOT + sep so attackers cannot escape the document root.
     The `=== ROOT` short-circuit accepts the root itself — readFile on
     a directory throws EISDIR which we correctly map to a 404 below. */
  const filePath = resolvePath(ROOT, '.' + pathname);
  if (!filePath.startsWith(ROOT + sep) && filePath !== ROOT) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const acceptsGzip = /gzip/.test(req.headers['accept-encoding'] || '');
  const canGzip = COMPRESSIBLE.has(ext) && acceptsGzip;

  if (ext === '.html') {
    try {
      const html = await readFile(filePath, 'utf-8');
      const withTag =
        !TEST_MODE && html.includes('</body>')
          ? html.replace('</body>', `${LIVERELOAD_TAG}\n</body>`)
          : TEST_MODE
            ? html
            : html + LIVERELOAD_TAG;
      const raw = Buffer.from(withTag, 'utf-8');
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'no-cache');
      if (TEST_MODE && acceptsGzip) {
        const compressed = await gzipAsync(raw);
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Length', compressed.length);
        res.writeHead(200);
        res.end(compressed);
      } else {
        res.setHeader('Content-Length', raw.length);
        res.writeHead(200);
        res.end(raw);
      }
    } catch (err) {
      res.writeHead(500);
      res.end('Server error');
      console.error('[dev-server] HTML read error:', err.message);
    }
    return;
  }

  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'no-cache');
  if (canGzip) {
    res.setHeader('Content-Encoding', 'gzip');
  }
  res.writeHead(200);

  const src = createReadStream(filePath);
  if (canGzip) {
    pipeline(src, createGzip(), res).catch(() => {});
  } else {
    src.pipe(res);
  }
});

httpServer.listen(PORT, () => {
  console.log(`\n🎻 Dev server → http://localhost:${PORT}`);
  if (!TEST_MODE) {
    console.log('   Livereload enabled — watching for file changes...\n');
  }
});

/* SIGINT/SIGTERM cleanup: closing the listener releases PORT and frees
   the file watchers; without this the next `npm run serve` (or any
   spawn-based caller) hits EADDRINUSE because the previous instance
   never released the socket on Ctrl+C. */
const shutdown = (signal) => {
  httpServer.close(() => process.exit(128 + (signal === 'SIGTERM' ? 15 : 2)));
  /* If close() takes too long (long-lived SSE connections from open
     browser tabs), force-exit after a short grace period so CI never
     hangs on signal. */
  setTimeout(() => process.exit(128 + (signal === 'SIGTERM' ? 15 : 2)), 1500).unref();
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
