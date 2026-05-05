/**
 * Unit tests for scripts/docs-lint.js — exercises the pure helper
 * functions (URL normalisation, line-number computation, npm-script
 * extraction, HTML/manifest asset extraction, asset-reference
 * validation, regex pattern matching).
 *
 * Why this test file exists:
 *   docs-lint.js IS the gate that catches drift in markdown / config
 *   / HTML / manifest. If a regex regresses (or pathFromUrl misses an
 *   edge case), real defects slip through silently — and the same
 *   one-time-fix discipline that the rest of the repo enforces (100%
 *   coverage on every js/** + sw.js, 100% mutation on production
 *   code) deserves to apply to its linter too. Before this file
 *   existed, docs-lint.js itself was the only build-pipeline script
 *   in scripts/ uncovered by tests/unit/scripts.test.js — a hidden
 *   "trust the linter" surface that this suite closes.
 *
 * Tests target the EXPORTED helpers and pass synthetic strings, never
 * the live working-tree state — the suite must remain stable across
 * file renames and content edits.
 */

import {
  pathFromUrl,
  lineNumOf,
  findNpmScriptReferences,
  extractHtmlAssetUrls,
  extractManifestIconSrcs,
  extractCssUrlReferences,
  extractCssFileAssetUrls,
  resolveCssUrl,
  validateAssetReferences,
  lintContent,
  FORBIDDEN_REFERENCES,
  FORBIDDEN_PROSE,
  SITE_BASE,
  discoverMarkdownFiles,
  discoverConfigFiles,
  lintFile,
  checkNpmScriptValidity,
  checkAssetReferences,
  main,
} from '../../scripts/docs-lint.js';

/**
 * Build an in-memory I/O object that simulates a tracked-file repo.
 * `tracked` is a record of repo-relative path → file content (or null
 * if the path should appear in `git ls-files` but reading it would
 * surface as missing — used to test edge cases). The `root` is a
 * synthetic prefix; tests assert on relative paths so it doesn't
 * matter what value it takes.
 */
function buildIO(tracked) {
  /* `path.join` uses the platform separator (`\` on Windows, `/` on
     Linux). Tests run on both via CI, so the IO mock normalises every
     incoming path to forward slashes before keying into `tracked`.
     This mirrors what the live IO does indirectly via `git ls-files`
     (which always emits POSIX paths regardless of OS). */
  const root = '/synthetic-root';
  const trackedPaths = Object.keys(tracked);
  const toRel = (abs) => {
    const norm = abs.replaceAll('\\', '/');
    return norm.startsWith(`${root}/`) ? norm.slice(root.length + 1) : norm;
  };
  return {
    gitLsFiles(patterns = []) {
      if (patterns.length === 0) {
        return trackedPaths.join('\n');
      }
      /* Match the live `git ls-files` glob behaviour just enough for
         our test cases: each pattern is a glob like "*.md" or
         "scripts/*.cjs"; we filter trackedPaths against any pattern. */
      const matchers = patterns.map((p) => {
        if (p.includes('/')) {
          /* Sub-dir glob, e.g. "scripts/*.cjs" → match prefix + extension */
          const [dir, file] = p.split('/');
          const ext = file.startsWith('*.') ? file.slice(1) : file;
          return (rel) =>
            rel.startsWith(`${dir}/`) &&
            rel.endsWith(ext) &&
            !rel.slice(dir.length + 1).includes('/');
        }
        /* Top-level glob, e.g. "*.md" → top-level files with the suffix */
        const ext = p.startsWith('*.') ? p.slice(1) : p;
        return (rel) => !rel.includes('/') && rel.endsWith(ext);
      });
      return trackedPaths.filter((rel) => matchers.some((m) => m(rel))).join('\n');
    },
    readFile(abs) {
      const rel = toRel(abs);
      const content = tracked[rel];
      if (content === undefined || content === null) {
        const err = new Error(`ENOENT: no such file '${abs}' (rel '${rel}')`);
        err.code = 'ENOENT';
        throw err;
      }
      return content;
    },
    fileExists(abs) {
      const rel = toRel(abs);
      return rel in tracked && tracked[rel] !== null;
    },
    root,
  };
}

describe('pathFromUrl — URL → repo-relative path normalisation', () => {
  test('absolute URL on SITE_BASE strips the prefix', () => {
    expect(pathFromUrl(`${SITE_BASE}images/og-card.jpg`)).toBe('images/og-card.jpg');
  });

  test('absolute URL on SITE_BASE drops query strings and fragments', () => {
    expect(pathFromUrl(`${SITE_BASE}dist/main.min.js?v=abc123`)).toBe('dist/main.min.js');
    expect(pathFromUrl(`${SITE_BASE}index.html#hero`)).toBe('index.html');
  });

  test('repo-relative path passes through, stripping query/hash', () => {
    expect(pathFromUrl('images/icon-512.png')).toBe('images/icon-512.png');
    expect(pathFromUrl('dist/main.min.js?v=deadbeef')).toBe('dist/main.min.js');
    expect(pathFromUrl('robots.txt#section')).toBe('robots.txt');
  });

  test('site-rooted path strips the leading slash', () => {
    expect(pathFromUrl('/images/icon-512.png')).toBe('images/icon-512.png');
    expect(pathFromUrl('//images/icon-512.png')).toBe(null); // protocol-relative is external
  });

  test('external https URL returns null', () => {
    expect(pathFromUrl('https://www.themiracleshard.com')).toBeNull();
    expect(pathFromUrl('https://attacker.example/log')).toBeNull();
  });

  test('external http URL returns null', () => {
    expect(pathFromUrl('http://example.com/asset.png')).toBeNull();
  });

  test('protocol-relative URL returns null (external)', () => {
    expect(pathFromUrl('//cdn.example.com/script.js')).toBeNull();
  });

  test('data: URL returns null (inline content, not a fetched asset)', () => {
    expect(pathFromUrl("data:image/svg+xml,<svg xmlns='...'/>")).toBeNull();
  });

  test('mailto: / tel: URIs return null', () => {
    expect(pathFromUrl('mailto:foo@example.com')).toBeNull();
    expect(pathFromUrl('tel:+39000000000')).toBeNull();
  });

  test('fragment-only anchor returns null (in-page nav, not an asset)', () => {
    expect(pathFromUrl('#main-content')).toBeNull();
  });

  test('empty / falsy input returns null', () => {
    expect(pathFromUrl('')).toBeNull();
    expect(pathFromUrl(null)).toBeNull();
    expect(pathFromUrl(undefined)).toBeNull();
  });

  test('custom siteBase argument overrides default', () => {
    /* Pinning the second-arg branch ensures the test suite catches a
       regression where someone hardcodes SITE_BASE inside the function
       body instead of using the parameter. */
    expect(pathFromUrl('https://other.test/foo/bar.png', 'https://other.test/foo/')).toBe(
      'bar.png',
    );
  });
});

describe('lineNumOf — byte offset → 1-based line', () => {
  test('offset 0 returns line 1', () => {
    expect(lineNumOf('line one\nline two\nline three', 0)).toBe(1);
  });

  test('offset within first line still returns 1', () => {
    expect(lineNumOf('line one\nline two', 4)).toBe(1);
  });

  test('offset at start of second line returns 2', () => {
    /* Index 9 is `l` of "line two" — counting newlines before that
       position gives 1, so 1+1=2 (split() is 1-indexed at the start). */
    expect(lineNumOf('line one\nline two', 9)).toBe(2);
  });

  test('offset past final newline returns the last line index', () => {
    /* 3 lines → final offset's line should be 3. */
    expect(lineNumOf('a\nb\nc', 4)).toBe(3);
  });
});

describe('findNpmScriptReferences — `npm run X` extraction', () => {
  test('captures a single script invocation', () => {
    const refs = findNpmScriptReferences('Run `npm run test:unit` to start.');
    expect(refs).toEqual([expect.objectContaining({ line: 1, script: 'test:unit' })]);
  });

  test('captures multiple invocations across lines', () => {
    const md = '# Title\n```\nnpm run lint\nnpm run test:e2e\n```';
    const refs = findNpmScriptReferences(md);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual(expect.objectContaining({ line: 3, script: 'lint' }));
    expect(refs[1]).toEqual(expect.objectContaining({ line: 4, script: 'test:e2e' }));
  });

  test('captures multiple invocations on the same line', () => {
    /* The `g` flag + while(exec(...)) loop must advance through both
       matches on the same line; a regression to `match()` (single
       match) would only return the first. */
    const refs = findNpmScriptReferences('compare `npm run lint` to `npm run lint:docs` here');
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.script)).toEqual(['lint', 'lint:docs']);
  });

  test('handles -- argument forwarding without grabbing the dashes', () => {
    const refs = findNpmScriptReferences('use `npm run test:e2e -- --debug` for the debugger');
    expect(refs).toEqual([expect.objectContaining({ script: 'test:e2e' })]);
  });

  test('handles colons, hyphens, and underscores in script names', () => {
    const refs = findNpmScriptReferences('npm run audit:lighthouse:mobile\nnpm run build_v2-fast');
    expect(refs.map((r) => r.script)).toEqual(['audit:lighthouse:mobile', 'build_v2-fast']);
  });

  test('does not match non-`npm run` patterns', () => {
    expect(findNpmScriptReferences('# Run `pnpm run X` instead')).toEqual([]);
    expect(findNpmScriptReferences('npm install something')).toEqual([]);
    expect(findNpmScriptReferences('npm-run-all --parallel a b')).toEqual([]);
  });

  test('CRLF line endings are handled', () => {
    const refs = findNpmScriptReferences('first\r\nnpm run test\r\nthird');
    expect(refs).toEqual([expect.objectContaining({ line: 2, script: 'test' })]);
  });
});

describe('extractHtmlAssetUrls — index.html scanner', () => {
  test('extracts og:image and twitter:image meta tags', () => {
    const html = `
      <meta property="og:image" content="https://example.com/og.png">
      <meta name="twitter:image" content="images/og-card.jpg">
    `;
    const refs = extractHtmlAssetUrls(html);
    expect(refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'og:image', url: 'https://example.com/og.png' }),
        expect.objectContaining({ label: 'twitter:image', url: 'images/og-card.jpg' }),
      ]),
    );
  });

  test('extracts <link href> for icon, manifest, preload, stylesheet', () => {
    const html = `
      <link rel="icon" href="favicon.ico">
      <link rel="apple-touch-icon" href="images/apple-touch-icon.png">
      <link rel="manifest" href="manifest.webmanifest">
      <link rel="preload" as="font" href="fonts/cinzel-400.woff2">
    `;
    const refs = extractHtmlAssetUrls(html);
    const urls = refs.filter((r) => r.label === '<link href>').map((r) => r.url);
    expect(urls).toEqual([
      'favicon.ico',
      'images/apple-touch-icon.png',
      'manifest.webmanifest',
      'fonts/cinzel-400.woff2',
    ]);
  });

  test('extracts <script src> with attributes between script and src', () => {
    const html = '<script defer src="dist/main.min.js?v=abc"></script>';
    const refs = extractHtmlAssetUrls(html);
    expect(refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '<script src>', url: 'dist/main.min.js?v=abc' }),
      ]),
    );
  });

  test('extracts <img src>', () => {
    const html = '<img src="images/ghironda-fallback.png" alt="…" width="280" height="153">';
    const refs = extractHtmlAssetUrls(html);
    expect(refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '<img src>', url: 'images/ghironda-fallback.png' }),
      ]),
    );
  });

  test('extracts every URL from a comma-separated <source srcset>', () => {
    const html = `<source type="image/webp" srcset="images/a.webp 280w,
                                                    images/b.webp 720w,
                                                    images/c.webp 1080w" sizes="…">`;
    const refs = extractHtmlAssetUrls(html);
    const urls = refs.filter((r) => r.label === '<source srcset>').map((r) => r.url);
    expect(urls).toEqual(['images/a.webp', 'images/b.webp', 'images/c.webp']);
  });

  test('extracts schema.org JSON-LD logo and image keys', () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "logo": "https://example.com/images/icon-512.png",
        "image": "images/og-card.jpg"
      }
      </script>
    `;
    const refs = extractHtmlAssetUrls(html);
    const ldRefs = refs.filter((r) => r.label.startsWith('schema.org'));
    expect(ldRefs).toHaveLength(2);
    expect(ldRefs.map((r) => r.url).sort()).toEqual(
      ['https://example.com/images/icon-512.png', 'images/og-card.jpg'].sort(),
    );
  });

  test('multi-line srcset reports the line where the attribute opens', () => {
    /* Pinning the line-number wiring catches a regression where the
       byte-offset → line conversion breaks on multi-line attributes. */
    const html = 'preamble\n<source srcset="a.webp 280w,\n  b.webp 420w" sizes="…">\nrest';
    const refs = extractHtmlAssetUrls(html);
    const srcsetRefs = refs.filter((r) => r.label === '<source srcset>');
    /* All entries from the same srcset attribute share the line-number
       of the opening tag (line 2). */
    expect(srcsetRefs.every((r) => r.lineNum === 2)).toBe(true);
  });

  test('returns empty array on HTML with no asset URLs', () => {
    expect(extractHtmlAssetUrls('<html><body><p>no assets</p></body></html>')).toEqual([]);
  });
});

describe('extractManifestIconSrcs — manifest.webmanifest scanner', () => {
  test('extracts every icons[].src', () => {
    const manifest = JSON.stringify(
      {
        name: 'Test',
        icons: [
          { src: 'images/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'images/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      null,
      2,
    );
    const refs = extractManifestIconSrcs(manifest);
    expect(refs.map((r) => r.url)).toEqual(['images/icon-192.png', 'images/icon-512.png']);
    /* Each ref carries the icons[].src label (drives the violation message). */
    expect(refs.every((r) => r.label === 'icons[].src')).toBe(true);
  });

  test('returns empty array when manifest has no icons key', () => {
    expect(extractManifestIconSrcs(JSON.stringify({ name: 'X' }))).toEqual([]);
  });

  test('returns empty array when icons is not an array', () => {
    expect(extractManifestIconSrcs(JSON.stringify({ icons: 'not-an-array' }))).toEqual([]);
  });

  test('skips icon entries without a string src', () => {
    const manifest = JSON.stringify({
      icons: [{ src: 'a.png' }, { src: null }, { foo: 'bar' }, null, { src: 'b.png' }],
    });
    const refs = extractManifestIconSrcs(manifest);
    expect(refs.map((r) => r.url)).toEqual(['a.png', 'b.png']);
  });

  test('returns empty array on malformed JSON (parse error)', () => {
    expect(extractManifestIconSrcs('{ this is not JSON')).toEqual([]);
  });
});

describe('validateAssetReferences — refs × tracked-set → violations', () => {
  const tracked = new Set(['images/og-card.jpg', 'dist/main.min.js']);

  test('flags refs whose path is NOT in the tracked set', () => {
    const refs = [
      { label: 'og:image', url: 'images/missing.png', lineNum: 7 },
      { label: 'og:image', url: 'images/og-card.jpg', lineNum: 8 },
    ];
    const violations = validateAssetReferences('index.html', refs, tracked);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual(
      expect.objectContaining({
        file: 'index.html',
        line: 7,
        text: expect.stringContaining('missing.png'),
      }),
    );
  });

  test('skips refs that pathFromUrl returns null for (external/data/etc.)', () => {
    const refs = [
      { label: '<link href>', url: 'https://www.themiracleshard.com', lineNum: 1 },
      { label: '<link href>', url: 'data:image/svg+xml,<svg/>', lineNum: 2 },
      { label: '<link href>', url: '#main-content', lineNum: 3 },
    ];
    expect(validateAssetReferences('index.html', refs, tracked)).toEqual([]);
  });

  test('absolute SITE_BASE URL is normalised before lookup', () => {
    const refs = [{ label: 'og:image', url: `${SITE_BASE}dist/main.min.js`, lineNum: 5 }];
    expect(validateAssetReferences('index.html', refs, tracked)).toEqual([]);
  });

  test('violation reason mentions the resolved path, not the original URL', () => {
    const refs = [{ label: 'og:image', url: `${SITE_BASE}images/ghost.png`, lineNum: 5 }];
    const v = validateAssetReferences('index.html', refs, tracked);
    expect(v[0].reason).toContain('"images/ghost.png"');
  });

  test('returns empty array when every ref is tracked', () => {
    const refs = [
      { label: 'og:image', url: 'images/og-card.jpg', lineNum: 1 },
      { label: '<script src>', url: 'dist/main.min.js?v=abc', lineNum: 2 },
    ];
    expect(validateAssetReferences('index.html', refs, tracked)).toEqual([]);
  });

  /* Round 20 (option B): `dist/*.{js,css}` are BUILDABLE_ASSETS — not
     git-tracked but produced by `npm run build` and shipped on
     `gh-pages`. The validator recognises this slim allowlist so source
     `index.html` references to runtime URLs don't false-positive.

     The tests below pin the allowlist's CONTRACT: the same `tracked`
     set INTENTIONALLY omits both buildable paths (so the only way a
     ref can pass without violation is via the allowlist), and we
     verify each one individually. A regression that empties the
     allowlist makes both pass tests fail loudly; a regression that
     widens it (e.g. masking a typo'd `dist/main.mn.js`) is caught by
     the negative-case test. */
  describe('BUILDABLE_ASSETS allowlist (round 20 source/deploy split)', () => {
    const trackedWithoutBuildables = new Set(['images/og-card.jpg']);

    test('dist/main.min.js passes despite NOT being in tracked set', () => {
      const refs = [{ label: '<script src>', url: 'dist/main.min.js', lineNum: 1 }];
      expect(validateAssetReferences('index.html', refs, trackedWithoutBuildables)).toEqual([]);
    });

    test('dist/main.min.js?v=hash also passes (cache-bust query stripped before lookup)', () => {
      const refs = [{ label: '<script src>', url: 'dist/main.min.js?v=deadbeef', lineNum: 1 }];
      expect(validateAssetReferences('index.html', refs, trackedWithoutBuildables)).toEqual([]);
    });

    test('dist/style-deferred.min.css passes despite NOT being in tracked set', () => {
      const refs = [{ label: '<link href>', url: 'dist/style-deferred.min.css', lineNum: 1 }];
      expect(validateAssetReferences('index.html', refs, trackedWithoutBuildables)).toEqual([]);
    });

    test('typo on a buildable path STILL flags as violation', () => {
      // `dist/main.mn.js` is not tracked AND not on the allowlist;
      // the bypass must be exact-match, not prefix-match.
      const refs = [{ label: '<script src>', url: 'dist/main.mn.js', lineNum: 7 }];
      const v = validateAssetReferences('index.html', refs, trackedWithoutBuildables);
      expect(v).toHaveLength(1);
      expect(v[0].reason).toContain('"dist/main.mn.js"');
    });

    test('buildable allowlist does not bypass paths outside dist/', () => {
      // A typo that lands `disst/main.min.js` shouldn't get a free
      // pass — it's not in `tracked`, not in BUILDABLE_ASSETS.
      const refs = [{ label: '<script src>', url: 'disst/main.min.js', lineNum: 9 }];
      const v = validateAssetReferences('index.html', refs, trackedWithoutBuildables);
      expect(v).toHaveLength(1);
      expect(v[0].reason).toContain('"disst/main.min.js"');
    });
  });
});

describe('lintContent — regex pattern layer', () => {
  const patterns = [
    { pattern: /\bsetupObserver\b/, reason: 'observer.js was removed' },
    { pattern: /\bjs\/config\.js\b/, reason: 'config.js was removed' },
  ];

  test('flags a line that matches a forbidden reference', () => {
    const violations = lintContent('Line 1\nUse setupObserver here\nLine 3', patterns);
    expect(violations).toEqual([
      expect.objectContaining({
        line: 2,
        text: 'Use setupObserver here',
        reason: 'observer.js was removed',
      }),
    ]);
  });

  test('reports multiple violations on the same line (one per pattern)', () => {
    const violations = lintContent('See setupObserver in js/config.js', patterns);
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.reason).sort()).toEqual(
      ['config.js was removed', 'observer.js was removed'].sort(),
    );
  });

  test('reports the same pattern matching on different lines', () => {
    const violations = lintContent('setupObserver\nirrelevant\nsetupObserver again', patterns);
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.line)).toEqual([1, 3]);
  });

  test('returns empty array when no pattern matches', () => {
    expect(lintContent('all clean here\nnothing forbidden\n', patterns)).toEqual([]);
  });

  test('CRLF line endings are handled', () => {
    const violations = lintContent('line one\r\nsetupObserver\r\nline three', patterns);
    expect(violations).toEqual([expect.objectContaining({ line: 2 })]);
  });
});

describe('FORBIDDEN_REFERENCES & FORBIDDEN_PROSE — pattern coverage smoke', () => {
  /* High-level smoke: each list is non-empty and each entry has the
     contracted shape. Catches a regression where someone restructures
     the export and breaks the iteration in lintContent(). */
  test('FORBIDDEN_REFERENCES contains entries with pattern + reason', () => {
    expect(FORBIDDEN_REFERENCES.length).toBeGreaterThan(0);
    for (const entry of FORBIDDEN_REFERENCES) {
      expect(entry.pattern).toBeInstanceOf(RegExp);
      expect(typeof entry.reason).toBe('string');
      expect(entry.reason.length).toBeGreaterThan(10);
    }
  });

  test('FORBIDDEN_PROSE contains entries with pattern + reason', () => {
    expect(FORBIDDEN_PROSE.length).toBeGreaterThan(0);
    for (const entry of FORBIDDEN_PROSE) {
      expect(entry.pattern).toBeInstanceOf(RegExp);
      expect(typeof entry.reason).toBe('string');
    }
  });

  test('the "main.js untestable in jsdom" pattern matches stale claims', () => {
    /* Behavioural pin: confirms the rule introduced in the Apr 2026
       follow-up actually fires on the kind of doc text it was added to
       catch. Regression-resistant against pattern weakening. */
    const stalePhrase =
      'js/main.js is excluded from coverage because every branch is istanbul-ignored as untestable in jsdom';
    const matches = FORBIDDEN_PROSE.some(({ pattern }) => pattern.test(stalePhrase));
    expect(matches).toBe(true);
  });

  test('the "subset-fonts.js" pattern matches the deleted-script reference', () => {
    /* Behavioural pin for FORBIDDEN_REFERENCES — `subset-fonts.js` was
       deleted because it overwrote text-targeted woff2 with a generic
       Latin-Ext-A subset. Doc that still mentions it is stale. */
    const stale = 'run scripts/subset-fonts.js and check the output';
    const matches = FORBIDDEN_REFERENCES.some(({ pattern }) => pattern.test(stale));
    expect(matches).toBe(true);
  });
});

describe('extractCssUrlReferences — url(...) extraction from CSS', () => {
  test('captures unquoted url()', () => {
    expect(extractCssUrlReferences('background: url(images/foo.png);')).toEqual([
      expect.objectContaining({ url: 'images/foo.png' }),
    ]);
  });

  test('captures double-quoted and single-quoted forms', () => {
    const refs = extractCssUrlReferences('a{background:url("a.png")} b{background:url(\'b.png\')}');
    expect(refs.map((r) => r.url)).toEqual(['a.png', 'b.png']);
  });

  test('tolerates whitespace inside url(...)', () => {
    expect(extractCssUrlReferences('background: url( spaced.png );')).toEqual([
      expect.objectContaining({ url: 'spaced.png' }),
    ]);
  });

  test('captures a single-quoted data: URL whose body contains double-quoted SVG attrs', () => {
    /* The realistic case from the production deferred-CSS bundle: a
       data: URL wrapped in single quotes whose body contains
       `xmlns="http://..."` attributes. The pre-Round-5 regex
       (`[^"')]`) silently dropped these because the exclusion class
       included both quote chars. The tri-form regex hands the body
       to the single-quote branch, which only excludes `'` — the
       double quotes inside are passed through. */
    const refs = extractCssUrlReferences(
      `a{background:url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')}`,
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe(
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    );
  });

  test('captures a double-quoted data: URL whose body contains single quotes', () => {
    /* Symmetric coverage of the double-quote branch. */
    const refs = extractCssUrlReferences(
      `a{background:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg>")}`,
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe(
      "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg>",
    );
  });

  test('captures unquoted data: URL with no whitespace / quotes inside', () => {
    /* The unquoted branch — first char is non-quote, body extends
       non-greedily to the next `)`. Real-world CSS minifiers rarely
       emit unquoted data: URLs because the `,` and `;` inside push
       reliability towards quoting, but the spec allows it. */
    const refs = extractCssUrlReferences('a{background:url(data:image/svg+xml,<svg/>)}');
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe('data:image/svg+xml,<svg/>');
  });

  test('outer single-quoted url() consumes its inner url(...) — no nested capture', () => {
    /* In the production deferred-CSS bundle the inline SVG body
       contains `<rect fill="url(%23gipsy)"/>`. The OUTER url('...')
       must consume the whole single-quoted payload, including this
       inner `url(...)` token, as a single asset reference. The
       previous regex incorrectly emitted the inner `%23gipsy` as a
       separate capture (false-positive that resolveCssUrl had to
       compensate for). */
    const css = `a{background:url('data:image/svg+xml,<svg xmlns="x"><rect fill="url(%23gipsy)"/></svg>')}`;
    const refs = extractCssUrlReferences(css);
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toContain('data:image/svg+xml');
  });

  test('returns multiple refs across the same content', () => {
    const css = 'a{background:url(a.png),url(b.png),url(c.png)}';
    expect(extractCssUrlReferences(css).map((r) => r.url)).toEqual(['a.png', 'b.png', 'c.png']);
  });

  test('returns empty array on CSS with no url() at all', () => {
    expect(extractCssUrlReferences('a{color:red}')).toEqual([]);
  });
});

describe('resolveCssUrl — CSS url() → repo-relative path', () => {
  test('resolves a file in the same directory as the CSS', () => {
    expect(resolveCssUrl('foo.png', 'images')).toBe('images/foo.png');
  });

  test('resolves "../" parent traversal correctly', () => {
    expect(resolveCssUrl('../fonts/cinzel-600.woff2', 'dist')).toBe('fonts/cinzel-600.woff2');
  });

  test('strips query strings and fragments before joining', () => {
    expect(resolveCssUrl('foo.png?v=abc', 'images')).toBe('images/foo.png');
    expect(resolveCssUrl('foo.png#section', 'images')).toBe('images/foo.png');
  });

  test('handles empty baseDir (inline <style>)', () => {
    expect(resolveCssUrl('fonts/cinzel-400.woff2', '')).toBe('fonts/cinzel-400.woff2');
  });

  test('returns null for data: URLs', () => {
    expect(resolveCssUrl('data:image/svg+xml,<svg/>', 'dist')).toBeNull();
  });

  test('returns null for external https/http/protocol-relative URLs', () => {
    expect(resolveCssUrl('https://cdn.example.com/x.woff2', '')).toBeNull();
    expect(resolveCssUrl('http://example.com/x.woff2', '')).toBeNull();
    expect(resolveCssUrl('//cdn.example.com/x.woff2', '')).toBeNull();
  });

  test('returns null for fragment-only refs (#filter-id)', () => {
    /* Pinning the SVG fragment-id branch — without it, the deferred
       CSS bundle's inline-SVG `<rect fill="url(%23gipsy)"/>` would
       false-positive as an asset. */
    expect(resolveCssUrl('#filter-id', 'dist')).toBeNull();
  });

  test('returns null for URL-encoded fragment refs (%23xxx)', () => {
    expect(resolveCssUrl('%23gipsy-ornament', 'dist')).toBeNull();
  });

  test('returns null on empty / falsy input', () => {
    expect(resolveCssUrl('', 'dist')).toBeNull();
    expect(resolveCssUrl(null, 'dist')).toBeNull();
  });

  test('normalises path joins on Windows-style backslash baseDir', () => {
    /* path.join uses the platform separator; resolveCssUrl converts
       to POSIX before joining so the result keys cleanly into
       tracked-file lookups. */
    expect(resolveCssUrl('foo.png', 'a\\b')).toBe('a/b/foo.png');
  });
});

describe('extractCssFileAssetUrls — combined extract + resolve + label', () => {
  test('produces refs for a deferred CSS bundle', () => {
    const css = `
      @font-face{src:url(../fonts/cinzel-600.woff2)}
      .x{background:url(../images/ghironda-rings.svg)}
    `;
    const refs = extractCssFileAssetUrls(css, 'dist/style-deferred.min.css');
    expect(refs.map((r) => r.url).sort()).toEqual([
      'fonts/cinzel-600.woff2',
      'images/ghironda-rings.svg',
    ]);
    /* Each label embeds the ORIGINAL `url(...)` payload so the
       violation message preserves what the maintainer wrote (the
       resolved path is in `url` separately). */
    expect(refs.map((r) => r.label).sort()).toEqual([
      'dist/style-deferred.min.css url(../fonts/cinzel-600.woff2)',
      'dist/style-deferred.min.css url(../images/ghironda-rings.svg)',
    ]);
  });

  test('skips data:/external/fragment URLs', () => {
    const css =
      '@font-face{src:url(https://cdn/x.woff2)} .y{background:url(#filter)} .z{background:url(data:foo)}';
    expect(extractCssFileAssetUrls(css, 'dist/style.css')).toEqual([]);
  });

  test('attaches line numbers from the offset', () => {
    const css = 'first\n@font-face{src:url(../fonts/x.woff2)}\nthird';
    const refs = extractCssFileAssetUrls(css, 'dist/style.css');
    expect(refs).toEqual([expect.objectContaining({ url: 'fonts/x.woff2', lineNum: 2 })]);
  });
});

describe('extractHtmlAssetUrls — inline <style> url() coverage', () => {
  test('extracts url() refs from inline <style> with the original payload in the label', () => {
    const html = `
      <style>
        @font-face { src: url(fonts/cinzel-400.woff2); }
        .a { background: url(images/foo.png); }
      </style>
    `;
    const refs = extractHtmlAssetUrls(html);
    const inlineRefs = refs.filter((r) => r.label.startsWith('inline <style> url('));
    expect(inlineRefs.map((r) => r.url).sort()).toEqual([
      'fonts/cinzel-400.woff2',
      'images/foo.png',
    ]);
    /* Each label embeds the ORIGINAL `url(...)` payload — drives the
       violation diagnostic format so a maintainer reading a failed
       lint sees the literal text they wrote (e.g.
       `inline <style> url(fonts/cinzel-400.woff2)`), not just a
       generic placeholder. */
    expect(inlineRefs.map((r) => r.label).sort()).toEqual([
      'inline <style> url(fonts/cinzel-400.woff2)',
      'inline <style> url(images/foo.png)',
    ]);
  });

  test('does not surface data: URLs from inline <style>', () => {
    const html = '<style>.a{background:url(data:image/svg+xml,<svg/>)}</style>';
    const refs = extractHtmlAssetUrls(html);
    expect(refs.filter((r) => r.label.startsWith('inline <style> url('))).toEqual([]);
  });

  test('does not surface fragment refs from inline <style>', () => {
    /* Mirrors the SVG-pattern case where url(%23xxx) appears inside
       a data: URL's body — should not surface as a real asset. */
    const html = '<style>.a{filter:url(#blur)}</style>';
    expect(
      extractHtmlAssetUrls(html).filter((r) => r.label.startsWith('inline <style> url(')),
    ).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────
   I/O WRAPPER TESTS — exercise discover*, lintFile, checkNpm*,
   checkAssetReferences, main against the in-memory `buildIO` mock.
   These close the "pure helpers covered, wrappers uncovered" gap
   identified in fresh-eyes round #4: the wrappers are now
   behaviourally verified instead of relying solely on the live
   `npm run lint:docs` integration run.
   ───────────────────────────────────────────────────────────────────── */

describe('discoverMarkdownFiles — git ls-files glob + EXCLUDE filter', () => {
  test('returns top-level *.md tracked files', () => {
    const io = buildIO({
      'README.md': '# Title',
      'TESTING.md': '# Tests',
      'package.json': '{}',
    });
    const files = discoverMarkdownFiles(io);
    expect(files.map((f) => f.rel).sort()).toEqual(['README.md', 'TESTING.md']);
    /* abs paths are joined under io.root — slash style is platform-
       dependent (path.join uses `\` on Windows), so check for the
       platform-agnostic substring after normalisation. */
    expect(files[0].abs.replaceAll('\\', '/')).toContain('/synthetic-root/');
  });

  test('excludes CHANGELOG.md (whitelisted history file)', () => {
    const io = buildIO({
      'README.md': '# Title',
      'CHANGELOG.md': '# Changelog',
    });
    const files = discoverMarkdownFiles(io);
    expect(files.map((f) => f.rel)).toEqual(['README.md']);
  });

  test('returns empty array when no markdown files are tracked', () => {
    const io = buildIO({ 'package.json': '{}' });
    expect(discoverMarkdownFiles(io)).toEqual([]);
  });

  test('handles CRLF line endings in git output', () => {
    /* Custom IO with CRLF in git output — Windows-friendliness check. */
    const io = {
      gitLsFiles: () => 'README.md\r\nTESTING.md\r\n',
      readFile: () => '',
      fileExists: () => true,
      root: '/x',
    };
    expect(discoverMarkdownFiles(io).map((f) => f.rel)).toEqual(['README.md', 'TESTING.md']);
  });
});

describe('discoverConfigFiles — globs + package-lock.json skip', () => {
  test('returns top-level json/cjs/mjs and scripts/*.cjs|.mjs', () => {
    const io = buildIO({
      'package.json': '{}',
      'tsconfig.json': '{}',
      'babel.config.cjs': '',
      'eslint.config.js': '' /* .js NOT scanned */,
      'scripts/dev-server.js': '' /* .js NOT scanned */,
      'scripts/foo.cjs': '',
      'scripts/bar.mjs': '',
    });
    const files = discoverConfigFiles(io);
    expect(files.map((f) => f.rel).sort()).toEqual([
      'babel.config.cjs',
      'package.json',
      'scripts/bar.mjs',
      'scripts/foo.cjs',
      'tsconfig.json',
    ]);
  });

  test('skips package-lock.json (machine-generated, false-positive risk)', () => {
    const io = buildIO({
      'package.json': '{}',
      'package-lock.json': '{}',
    });
    const files = discoverConfigFiles(io);
    expect(files.map((f) => f.rel)).toEqual(['package.json']);
  });
});

describe('lintFile — readFile + lintContent composition', () => {
  test('reads abs path and decorates violations with rel filename', () => {
    const io = buildIO({ 'README.md': 'use setupObserver here' });
    const patterns = [{ pattern: /\bsetupObserver\b/, reason: 'observer.js was removed' }];
    const violations = lintFile(
      { rel: 'README.md', abs: '/synthetic-root/README.md' },
      patterns,
      io,
    );
    expect(violations).toEqual([
      expect.objectContaining({ file: 'README.md', line: 1, reason: 'observer.js was removed' }),
    ]);
  });

  test('returns empty array on a clean file', () => {
    const io = buildIO({ 'TESTING.md': 'all clean here' });
    const patterns = [{ pattern: /\bbadthing\b/, reason: 'should not appear' }];
    expect(
      lintFile({ rel: 'TESTING.md', abs: '/synthetic-root/TESTING.md' }, patterns, io),
    ).toEqual([]);
  });
});

describe('checkNpmScriptValidity — package.json scripts × md references', () => {
  test('flags references to scripts not in package.json', () => {
    const io = buildIO({
      'package.json': JSON.stringify({ scripts: { 'test:unit': 'jest', lint: 'eslint .' } }),
      'README.md': 'Run `npm run test:unit` then `npm run test:a11y:axe`.',
    });
    const mdFiles = discoverMarkdownFiles(io);
    const violations = checkNpmScriptValidity(mdFiles, io);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual(
      expect.objectContaining({
        file: 'README.md',
        reason: expect.stringContaining('npm run test:a11y:axe'),
      }),
    );
  });

  test('clean when every npm-run reference resolves', () => {
    const io = buildIO({
      'package.json': JSON.stringify({ scripts: { 'test:unit': 'jest', lint: 'eslint .' } }),
      'TESTING.md': 'Run `npm run test:unit` for unit tests, `npm run lint` for lint.',
    });
    const mdFiles = discoverMarkdownFiles(io);
    expect(checkNpmScriptValidity(mdFiles, io)).toEqual([]);
  });

  test('handles package.json with no scripts field', () => {
    const io = buildIO({
      'package.json': JSON.stringify({ name: 'x' }),
      'README.md': 'Run `npm run anything`.',
    });
    const mdFiles = discoverMarkdownFiles(io);
    /* Every reference becomes a violation when validScripts is empty. */
    const violations = checkNpmScriptValidity(mdFiles, io);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain('anything');
  });
});

describe('checkAssetReferences — index.html + manifest integration', () => {
  test('clean when every asset URL points at a tracked file', () => {
    const io = buildIO({
      'index.html': `
        <link rel="apple-touch-icon" href="images/apple-touch-icon.png">
        <img src="images/ghironda-fallback.png">
      `,
      'manifest.webmanifest': JSON.stringify({
        icons: [{ src: 'images/icon-512.png', sizes: '512x512', type: 'image/png' }],
      }),
      'images/apple-touch-icon.png': '<binary>',
      'images/ghironda-fallback.png': '<binary>',
      'images/icon-512.png': '<binary>',
    });
    expect(checkAssetReferences(io)).toEqual([]);
  });

  test('flags index.html references to untracked files', () => {
    const io = buildIO({
      'index.html': `<meta property="og:image" content="${SITE_BASE}images/missing.png">`,
      /* manifest absent; the wrapper should skip cleanly */
      'images/icon-512.png': '<binary>',
    });
    const violations = checkAssetReferences(io);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual(
      expect.objectContaining({
        file: 'index.html',
        text: expect.stringContaining('og:image'),
        reason: expect.stringContaining('images/missing.png'),
      }),
    );
  });

  test('flags manifest icons that reference untracked files', () => {
    const io = buildIO({
      'index.html': '<title>x</title>',
      'manifest.webmanifest': JSON.stringify({
        icons: [
          { src: 'images/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'images/icon-deleted.png', sizes: '512x512', type: 'image/png' },
        ],
      }),
      'images/icon-192.png': '<binary>',
    });
    const violations = checkAssetReferences(io);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual(
      expect.objectContaining({
        file: 'manifest.webmanifest',
        reason: expect.stringContaining('images/icon-deleted.png'),
      }),
    );
  });

  test('skips index.html / manifest cleanly when absent', () => {
    /* No index.html and no manifest in tracked → no checks run, no
       violations. The fileExists guard prevents readFile from throwing. */
    const io = buildIO({ 'package.json': '{}' });
    expect(checkAssetReferences(io)).toEqual([]);
  });
});

describe('main — full pipeline integration', () => {
  let logSpy;
  let errSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  test('returns 0 and logs the success line when nothing is wrong', () => {
    const io = buildIO({
      'package.json': JSON.stringify({ scripts: { lint: 'eslint .' } }),
      'README.md': 'Run `npm run lint` to lint.',
      'index.html': '<title>x</title>',
      'manifest.webmanifest': JSON.stringify({ icons: [] }),
    });
    const exit = main(io);
    expect(exit).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('docs-lint:'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  test('returns 1 and emits violation diagnostics when any layer fails', () => {
    const io = buildIO({
      'package.json': JSON.stringify({ scripts: { lint: 'eslint .' } }),
      /* Trigger the npm-script layer */
      'README.md': 'Run `npm run nonexistent`.',
      /* Trigger the regex layer (FORBIDDEN_REFERENCES will hit
         setupObserver, which is in the production list of removed
         entities). */
      'OTHER.md': 'see setupObserver in the old observer.js',
      'index.html': '<title>x</title>',
    });
    const exit = main(io);
    expect(exit).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('stale references found'));
    /* Total line summarises layer counts */
    const totalLine = errSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Total:'),
    );
    expect(totalLine).toBeDefined();
    expect(totalLine[0]).toContain('regex');
    expect(totalLine[0]).toContain('npm-script');
    expect(totalLine[0]).toContain('asset-reference');
  });

  test('returns 1 when only the asset-reference layer fails', () => {
    const io = buildIO({
      'package.json': JSON.stringify({ scripts: {} }),
      'index.html': `<meta property="og:image" content="${SITE_BASE}images/gone.png">`,
    });
    const exit = main(io);
    expect(exit).toBe(1);
  });
});
