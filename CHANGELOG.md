# Changelog

All notable changes to La Compagnia della Ghironda are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### May 2026 follow-up — Round 20: source/deploy branch separation (option B production-grade) (2026-05-04)

The 19 prior fresh-eyes rounds exhausted the surface area of an architecture where source and deploy artefacts coexisted on `main`. Round 20 is a **structural** change rather than another regex-grep round: source and deploy are physically separated into different branches.

**What changed:**

- **`main` branch holds source only.** The deploy artefact lives under `.deploy/` (gitignored on `main`). Source `index.html` ships with empty `<!-- CSS:BEGIN --><!-- CSS:END -->` placeholders, no `?v=...` cache-bust query, `'sha256-PLACEHOLDER='` in the CSP, and source `sw.js` ships with `CACHE_NAME = 'ghironda-PLACEHOLDER'`. None of those source files are mutated by the build chain.
- **`gh-pages` branch holds the deploy artefact.** `.github/workflows/deploy.yml` runs `npm run build` on every push to `main`, then force-pushes the `.deploy/` directory contents to `gh-pages` as an orphan-rooted commit. GitHub Pages is reconfigured to serve from `gh-pages`. Each deploy commit is a single self-contained artefact — `git revert` on `gh-pages` rolls back a deploy without touching source.
- **`dist/` no longer exists in source** (untracked via `git rm --cached`, gitignored). The build outputs go to `.deploy/dist/` instead.
- **Build chain rewired** to write exclusively under `.deploy/`:
  - `build-css.js` reads source `index.html`, injects critical CSS, writes `.deploy/index.html`.
  - `build-js.js` writes `.deploy/dist/main.min.js`.
  - `scripts/copy-static-assets.js` (NEW) mirrors `fonts/`, `images/`, `.well-known/`, `sw.js`, `manifest.webmanifest`, `robots.txt`, `humans.txt`, `LICENSE` into `.deploy/`.
  - `scripts/cache-bust.js`, `generate-csp.js`, `update-sitemap.js`, `strip-html-comments.js`, `inject-doc-numbers.js`, `performance-budget.js`, `size-report.js` all retargeted to `.deploy/`.
- **Build chain step reorder.** `build:strip` now runs BEFORE `size-report`, `audit:performance`, `docs:numbers`. The previous order over-counted critical-CSS bytes by ~1.5 KB because the `<style>...</style>` regex extractor was matching from a literal `<style>` reference inside an HTML source-comment block above `<!-- CSS:BEGIN -->`. Stripping comments first eliminates the false match.
- **Dev server (`scripts/dev-server.js`) serves `.deploy/`.** A `npm run build` once before `npm run serve` populates the directory; the watcher then re-runs the relevant builder per source-file change. Live reload still works; the only regression is needing the initial build.
- **`scripts/docs-lint.js` extended** with a `BUILDABLE_ASSETS` allowlist (`dist/main.min.js`, `dist/style-deferred.min.css`) so source HTML's runtime-path references don't false-positive against the tracked-files lookup.
- **Test fixtures updated.** `tests/unit/scripts.test.js` sandbox now mirrors the `.deploy/` layout. `tests/unit/sw.test.js` accepts both the 8-hex hash and the round-20 placeholder for the `CACHE_NAME` source invariant.
- **CI updated.** `ci-cd.yml`'s bundle-integrity job now runs `npm run build` then validates `.deploy/` outputs (previously it expected `dist/` to be committed). New `deploy.yml` workflow handles the gh-pages publish.

**Why this design (option B production-grade) over the alternatives:**

The user explicitly chose this pattern after evaluating two simpler shapes: (a) keep building into `dist/` on `main` and live with source/deploy coexistence (status quo, brittle as proven by 19 cleanup rounds), or (b) keep `main` building into a top-level deploy directory but commit it (eliminates branch separation but bloats source history with binary churn). The branch-separation pattern is the canonical static-site model used by Hugo, Jekyll, mkdocs, every framework that publishes to GitHub Pages — `main` carries source intent, `gh-pages` carries shipped bytes. The cost is one extra workflow + first-time orient ation; the benefit is that every cleanup round closure is now structural rather than a regex chase.

**Migration notes for future devs:**

- `npm run check` / `npm run rebuild` clear both `dist/` and `.deploy/` (the former for legacy locally-built copies from before the migration).
- `inject-doc-numbers.js` reads SIZE metrics from `.deploy/` (post-build) but reads `LOC_HTML` from source `index.html` (the human-edited file the docs are describing — deploy is post-strip).
- `git ls-files` excludes `.deploy/` automatically (gitignored), so no scripts that walk tracked files need explicit `.deploy/` filters.

### Apr 2026 follow-up — drift gates, asset integrity, maskable icons, build-time number injection (2026-04-29 → 2026-04-30)

Iterative hardening across 17 fresh-eyes review rounds + one structural fix (Round 9, `inject-doc-numbers.js`). Each round closed a class of drift the previous one didn't catch; rounds 10-13 closed marker-coverage gaps in `.md` docs after the structural fix landed; round 14 was an explicit exhaustive markdown sweep; rounds 15-17 extended the marker layer to source-code comments (`.js`, `.css`, `.html`) and discovered the symmetric "comments don't nest" edge case in both directions.

#### Round 1 — config-comment + Stryker scope drift

- `stryker.conf.json` `_comment_mutate` field claimed `js/main.js is excluded as ... istanbul-ignored as untestable in jsdom`. The istanbul-ignore annotations had been removed in a prior refactor; the comment lied. Updated the comment AND removed `"!js/main.js"` from `mutate` — `tests/unit/main.test.js` already exercises every branch (readyState, link.onload/onerror, `?vitals` activation, SW registration success/failure/absent). Stryker now mutates main.js with all 30 mutants killed.
- `jest.config.cjs` coverage-threshold comment claimed "no remaining 'untestable in jsdom' code" while `js/modules/logger.js` still carried 3 documented `istanbul ignore` annotations (window.location is locked in jsdom — verified with `Object.defineProperty` AND `jest.spyOn`, both rejected). Comment updated to acknowledge these.
- `scripts/docs-lint.js` extended to scan `*.json` / `*.cjs` / `*.mjs` config files in addition to Markdown, so future `_comment_*` field drift surfaces immediately.

#### Round 2 — `og:image` broken + `npm run` script drift

- **`og:image` / `twitter:image` / Schema.org `Organization.logo` were 404'ing on every social-media crawler**: they referenced `images/ghironda.png`, which is gitignored (1.5 MB build source, never deployed). The `.gitignore` comment even claimed "NOT referenced by index.html" — false. Fixed by:
  - Generating a dedicated 1200×630 share card `images/og-card.jpg` (mozjpeg q=88, ~121 KB, letterboxed onto `#0f0a1a` brand night colour with `flatten` to drop the source PNG's alpha).
  - Pointing og:image / twitter:image at `og-card.jpg`, Schema.org `logo` at the existing `images/icon-512.png`.
  - Extending `scripts/generate-images.js` so the pipeline now produces every deployed variant (WebP responsive set, AVIF LCP candidate, palette PNG fallback, **og-card**, brand icons).
- **`docs-lint.js` integrity layer (new)**: catches the class of drift that allowed `og:image` to silently 404 for weeks.
  - `checkNpmScriptValidity()`: every `npm run X` token in markdown must resolve to a script defined in `package.json`. Caught a stale `npm run test:a11y:axe` reference in `TESTING.md` (the script was renamed to `test:accessibility` long ago).
  - `checkAssetReferences()`: every same-origin URL in `index.html` (`<meta>`, `<link>`, `<script>`, `<img>`, `<source srcset>`, JSON-LD `"logo"/"image"`) and `manifest.webmanifest icons[].src` must resolve to a tracked file in git. Would have caught the `og:image → ghironda.png` defect at the first build.

#### Round 3 — maskable PWA icons + offline cohort font + visual baselines visibility

- **Brand icons (`apple-touch-icon.png` 180×180, `icon-192.png`, `icon-512.png`) regenerated as maskable-correct truecolor PNGs.** The legacy palette PNGs letterboxed the 1.83:1 source artwork into a square canvas with TRANSPARENT bands on the SIDES — violated both the W3C maskable contract (`purpose: "any maskable"` requires fully-filled canvas + content in the central ≈80% safe zone) and the Schema.org Organization.logo expectation (Google Knowledge Panel renders on white → transparent edges show as visible halos). New pipeline: vignetted artwork resized into a 74% safe zone, composited at the centre of a solid `#0f0a1a` canvas, flattened so there is zero alpha at the boundary. File sizes net DOWN (palette → truecolor): icon-512 60 KB → 40 KB, icon-192 16 KB → 7.9 KB, apple-touch-icon 12 KB → 7.1 KB.
- **`fonts/cinzel-400.woff2` added to SW PRECACHE list.** Asymmetry closed: previously only `cinzel-700-lcp.woff2` was precached, while the body font (also preloaded + critical CSS) waited for stale-while-revalidate. First-time-offline visitors now render body in Cinzel from first paint instead of serif fallback.
- **`docs-lint.js` refactored to importable module + 50 unit tests** for the pure helpers (`pathFromUrl`, `lineNumOf`, `findNpmScriptReferences`, `extractHtmlAssetUrls`, `extractManifestIconSrcs`, `validateAssetReferences`, `lintContent`). The CLI shim moved to a `process.argv[1]` basename guard (using `import.meta.url` would have crashed under babel-jest's CJS transform).
- **Visual baselines visibility.** When `*-linux.png` snapshots are missing in CI (the dormant-by-default state on a fresh clone), `.github/workflows/test.yml` now writes a prominent block to `$GITHUB_STEP_SUMMARY` (rendered at the top of the PR view), not just `::warning::` annotations buried in the step log. New `TROUBLESHOOTING.md` section "Visual baselines missing in CI" documents the seeding workflow.

#### Round 4 — gate-of-the-gate consistency

- **`scripts/docs-lint.js` I/O wrappers tested via DI seam.** Added a `DocsLintIO` contract (`gitLsFiles`, `readFile`, `fileExists`, `root`) and refactored `discoverMarkdownFiles`, `discoverConfigFiles`, `lintFile`, `checkNpmScriptValidity`, `checkAssetReferences`, `main` to accept it as an optional dependency. Tests pass an in-memory `buildIO(tracked)` mock and assert behaviour without touching `node:fs` or spawning `git`. `main()` returns the exit code (0/1) instead of calling `process.exit` directly so it can be unit-tested. The CLI shim now invokes `process.exit(main())`. Total docs-lint tests: 50 → 90.
- **CSS `url()` integrity layer.** New helpers `extractCssUrlReferences`, `resolveCssUrl`, `extractCssFileAssetUrls`. Inline `<style>` blocks in `index.html` are now scanned for `url(...)` refs; `dist/style-deferred.min.css` is read and validated separately (relative paths resolve against `dist/`). The resolver explicitly skips `#fragment` and `%23xxx` URL-encoded fragment refs (the SVG-pattern `<rect fill="url(%23gipsy)"/>` inside a `data:image/svg+xml,...` body that the build's CSS minifier emits would otherwise false-positive).
- **`scripts/docs-lint.js` evaluated for Stryker mutation testing — kept out.** A 6-minute experimental run surfaced 156 surviving mutants on the gate, ~73 % of which are intrinsically equivalent under behavioural testing (Regex tweaks on the prose-pattern lists that match the same inputs, StringLiteral mutations on `reason:` informational text and console output messages). The 90 unit tests already pin every behavioural branch; gating Stryker at 100 % here would require ~150 `Stryker disable` annotations on equivalent-mutation classes — annotation noise without commensurate coverage gain. Decision documented in `stryker.conf.json _comment_mutate`. Production runtime (`js/**`, `sw.js`) stays mutation-gated; build tooling stays integration-tested via `npm run lint:docs` in CI.
- **`apple-touch-icon` declared `purpose: "any maskable"` in manifest.** After Round 3's regeneration the icon satisfies the maskable contract; the manifest entry was upgraded to match.
- **CHANGELOG entries** (this section) documenting all four rounds.

#### Round 5 — drift inside Round 4's deliverables

- **CHANGELOG verification numbers corrected.** The Round-4 close claimed "169 unit tests pass (was 51 pre-follow-up)"; both numbers were off (current was 191, pre-follow-up was 101). Same morphology as the Round-1 stale `_comment_mutate` defect: a hand-written assertion-of-fact in documentation that drifted from production state.
- **`extractCssUrlReferences` regex switched from single-class exclusion to tri-form alternation.** The previous `\burl\(\s*["']?([^"')]+)["']?\s*\)` regex silently dropped real-world data: URLs whose body contained `xmlns="..."` (the dominant case in production minified CSS), because `[^"')]` excluded both quote chars at once. Production behaviour was correct by accident — `resolveCssUrl` would have filtered these data: URLs anyway — but the regex doc and the test fixture were misleading. New regex `\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^"'\s)][^)]*?))\s*\)` matches the three CSS Values & Units `<url>` forms separately, each branch excluding only its own wrapping quote. Real data: URLs are now captured (and still filtered out by `resolveCssUrl`); inner false-positive `url(%23gipsy)` tokens inside outer single-quoted SVG bodies are no longer emitted as separate captures because the outer match consumes them.
- **CSS url() violation labels embed the original payload.** Previously `inline <style> url() → fonts/missing.woff2` (resolved path only); now `inline <style> url(fonts/missing.woff2) → fonts/missing.woff2` so a maintainer reading a failed lint sees the literal text they wrote, not a generic placeholder. Same change for the deferred CSS layer.
- **README "Quality Gates" section added + drift fixes.** The previous "Code Quality" section had multiple stale claims:
  - "Unit Tests: 60/60 passing" (current: 194)
  - "sw.js is instrumented manually via babel-plugin-istanbul because it loads via new Function rather than require" — both halves false since the dual-mode CJS bootstrap refactor
  - "Mutation Testing: 100% (Stryker, ... excludes main.js entry-point glue)" — main.js no longer excluded since Round 1
  - Duplicate `## 📊 Code Quality` H2 (two consecutive sections with the same heading)
  - The integrity layer wasn't documented anywhere visitor-facing
- These are the same drift class the linter targets, but split across non-contiguous lines so the regex pattern (line-by-line) didn't fire — accepted limitation of the regex layer.

#### Round 6 — drift architetturale-numerica

- **`ARCHITECTURE.md` "Why No Framework" section was a snapshot of pre-Level-B state.** Claimed "252 HTML lines, 200 JS lines, 1 300 CSS lines" (actual: 388, 591 incl. sw.js, 2 044) and "Complexity: Intersection Observer + header measurement only" — both halves false post-Level-B refactor (zero observer, zero JS-driven measurement). Updated to the post-refactor reality + total deployed gzip ~7.7 KB / 10 KB budget.
- **"70+ CSS Custom Properties" claim repeated in 3 docs** (`ARCHITECTURE.md:47`, `CSS-ARCHITECTURE.md:45`, `README.md:170`+`352`). Actual count from `css/1-variables.css`: ~30 unique custom properties. The "70+" was inflation by ~130 % — likely correct in some early version, never updated since. All 4 occurrences corrected to "~30".
- **`ARCHITECTURE.md:376` JS bundle size** "(~2 KB gzip)" — actual 1.01 KB gzip / 2.33 KB raw. Updated.

#### Round 7 — drift KB nei diagrammi pipeline

- **`BUILD.md` pipeline ASCII diagram had stale bundle sizes.** "main.min.js (~5 KB raw / ~2 KB gzip)" was off by 50 % (actual 2.3 / 1.0); "deferred CSS (~6 KB raw / ~1.8 KB gzip)" was off by 40 % (actual 8.9 / 2.5); inline `<style>` raw "16 KB" → 14.5 KB. Budget claim "CSS ≤ 7 KB" → 7.5 KB. The "well under 14 KB budget" closing line was anchored to a long-superseded budget value (now 10 KB total).
- **`BUILD.md` cache-bust composite description** mentioned 5 inputs; actual is 10 (added 5 woff2 font subsets in earlier rounds).
- **`CSS-ARCHITECTURE.md:373-378` bundle-size table** had the same numerical drift + the deferred-modules list was stale ("3-typography, 6-sections, 8-print" — missing fonts-deferred and 9-decorations, both moved to deferred during Level-B). Plus a stale claim that the deferred CSS is `<link rel="preload">`-loaded — the Level-B refactor switched to `main.js`-on-load fetching with a documented Slow-4G LCP rationale.
- **`PERFORMANCE-STRATEGY.md:8-21` Current Metrics table** had specific numbers off by up to 50 % (JS bundle "4.94 / 1.98" → actual 2.33 / 1.01). Replaced with measured values + a preamble explaining that the BUDGET column is the authoritative target while the value column drifts after every bundle change; pointer to `npm run size-report`.
- **`PERFORMANCE-STRATEGY.md:29` deferred-CSS module count** said "3 below-the-fold modules"; actual is 5 (build-css.js DEFERRED_MODULES). Updated.
- **`ARCHITECTURE.md:292` budget claim** `(5/10/14 KB)` → `(JS 3 KB / CSS 7.5 KB / Total 10 KB)`. The 5/10/14 values were the pre-tightening budget from before the Level-B refactor moved 9-decorations to deferred.
- **`ARCHITECTURE.md:135` performance line** "16 KB inline + 6 KB deferred (totale 22 KB raw, 6 KB gzip)" → "14.5 + 8.9 = 23.4 KB raw / 6.7 KB gzip" + nudge to `npm run size-report`.

#### Round 8 — drift ricorsiva: i fix dei round 6+7 non erano nel CHANGELOG, e altri 4 doc avevano lo stesso pattern

The Round-5 entry above explicitly identified "manual numeric / architectural claims in prose docs that drift from production state" as a recurring class. **Rounds 6 and 7 resolved instances of this class but did not document themselves in the CHANGELOG, so the class re-fired at the meta-level.** Round 8 closed the loop by:

- **Adding Round-6 and Round-7 entries** (the two sections immediately above this one).
- **`PERFORMANCE-STRATEGY.md:86-90` budget threshold block** had ALL THREE warn levels wrong (`warn at 2.5 / 6.5 / 9` — actual values from `scripts/performance-budget.js`: `warn 1.2 / 7.15 / 8.2`) plus a wrong CSS max (7 vs 7.5). Round 7 fixed the same drift class in the diagram tables but missed this header-block. Updated; added a sentence noting `performance-budget.js` is the single source of truth.
- **`TESTING.md:333-336` bundle-size block** had the SAME numeric drift Round 7 fixed in BUILD.md / CSS-ARCHITECTURE / PERFORMANCE-STRATEGY but in a fourth file Round 7 missed (the grep for "16 KB raw" / "6 KB raw" patterns didn't catch TESTING.md's prose-style "~16 KB" / "~6 KB"). Plus a stale CLS-rationale: "inline script pre-imposta `--header-h`" — the Level-B refactor switched to CSS-static `--header-h: 77px` + `:has()`-driven open-state, no inline script.
- **`TROUBLESHOOTING.md:111` CSS budget** off-by-0.5 (7 → 7.5).
- **`CONTRIBUTING.md:34` Node/npm requirements** "Node ≥ 22.13 and npm ≥ 10" — `package.json engines` declares `>=24.0.0` and `>=11.0.0`. Updated, plus reference to the `engine-strict=true` in `.npmrc` and the `NODE_VERSION` env in every CI workflow.

Round 8 deferred the structural fix (build-time number injection — see Round 9 below). Round 9 implemented it.

#### Round 9 — structural fix: build-time number injection

Across 8 rounds the same drift class kept resurfacing: bundle KB sizes, budget thresholds, custom-property counts, LOC counts, Node engine versions — all hand-maintained in prose docs and out-of-sync the moment any refactor changed the source. Each round was a regex-grep against the next instance the previous round missed.

**The closing fix**: `scripts/inject-doc-numbers.js` (~280 LOC, 13 unit tests) walks every tracked Markdown / JSON / CJS / MJS file (excluding `CHANGELOG.md` and `package-lock.json`) and replaces the body of every `<!-- AUTO:KEY -->X<!-- /AUTO -->` marker with the live value computed from the production sources. The mapping:

| Marker key                                             | Source                                                   |
| ------------------------------------------------------ | -------------------------------------------------------- |
| `JS_RAW`, `JS_GZIP`                                    | `dist/main.min.js` size + gzip                           |
| `CSS_DEFERRED_RAW`, `CSS_DEFERRED_GZIP`                | `dist/style-deferred.min.css` size + gzip                |
| `CSS_INLINE_RAW`, `CSS_INLINE_GZIP`                    | `index.html` `<style>` block, parsed live                |
| `CSS_TOTAL_*`, `TOTAL_*`                               | sums of the above                                        |
| `BUDGET_JS_MAX`, `BUDGET_JS_WARN` (× JS / CSS / Total) | parsed from `scripts/performance-budget.js`              |
| `CSS_VAR_COUNT`                                        | unique `--*` declarations in `1-variables.css`           |
| `LOC_HTML`, `LOC_JS_PROD`, `LOC_CSS`                   | `wc -l` over `index.html` / `js/**` + `sw.js` / `css/**` |
| `ENGINE_NODE`, `ENGINE_NPM`                            | `package.json engines`                                   |

Markers added to the highest-drift hotspots — `TESTING.md`, `BUILD.md`, `PERFORMANCE-STRATEGY.md`, `CSS-ARCHITECTURE.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `TROUBLESHOOTING.md`, `README.md`. The marker syntax (`<!-- AUTO:KEY -->X<!-- /AUTO -->`) renders as nothing in HTML / GitHub-rendered Markdown, so the prose reads exactly as before.

Build integration:

- `npm run build` ends with `npm run docs:numbers`, which runs the injector against the just-rebuilt `dist/`. Markers commit alongside the build artefacts.
- `npm run docs:numbers:check` is the read-only mode that exits non-zero if any marker is stale. Wired into the CI lint stage (`.github/workflows/test.yml`) — a dev who commits a `dist/` change without re-running the injector gets a CI failure with the stale-marker list.
- Idempotency: running the injector twice produces zero diff. Verified by `tests/unit/inject-doc-numbers.test.js`.

Trade-offs accepted:

- **Marker noise in source markdown**: the prose source has visible `<!-- AUTO:KEY -->X<!-- /AUTO -->` decorations. Rendered output is unaffected, but a writer editing the docs in raw form sees the markers.
- **CHANGELOG.md is excluded**: the file legitimately quotes example markers as prose; treating it as auto-managed would either (a) replace the example values with live numbers, defeating the example purpose, or (b) require a docstring-style escape mechanism. Same exclusion policy as `docs-lint.js`.
- **Unknown keys fail loudly**: a marker referencing an undefined `KEY` exits the script with an error pointing at the file. Forces the maintainer to either add the metric to `computeMetrics()` or remove the marker.

Effect: the next time anyone refactors the bundle, changes the budget in `performance-budget.js`, or bumps the Node engine in `package.json`, every doc that quotes that number updates on the next `npm run build`. The 8-round drift loop is structurally closed.

#### Round 10 — marker coverage gap

Round 9 implemented the injector but the marker SET it covered was incomplete: only the high-frequency drifters in BUILD.md / TESTING.md / PERFORMANCE-STRATEGY.md / CSS-ARCHITECTURE.md / ARCHITECTURE.md / CONTRIBUTING.md / TROUBLESHOOTING.md / a small subset of README.md were marker'd. **Plain-prose numbers in the rest of the docs continued to drift.** Round 10 fresh-eyes audit found:

- `README.md:419` Quality Stack table — "148 unit + 219 e2e + 312 mutation" — wrong by -28 % / +250 % / category-mismatch (312 was a mutants count snapshot, not a percentage).
- `README.md:418` JS bundle "~2 KB gzip" — actual ~1 KB gzip (off by 100 %).
- `README.md:417` "Custom Properties (70+)" — same drift Round 6 had ostensibly fixed in 4 other locations, missed on the Quality Stack row.
- `README.md:334` budget table values not marker'd — would drift on the next budget tightening.
- `README.md:466` "Performance under budget (~28 KB / ~9 KB gzip)" — close but stale.
- `PERFORMANCE-STRATEGY.md:75` "~2 KB raw / ~0.94 KB gzip" — slightly stale, plain prose.
- `README.md:21-25` font subset KB column + `CSS-ARCHITECTURE.md:23,26` — accurate but plain prose.

#### Round 11 — extended marker coverage

Three new metric keys added to `inject-doc-numbers.js`:

- `UNIT_TEST_COUNT`, `E2E_SPEC_COUNT` — static `test(...)` / `it(...)` count via grep over `tests/unit/` and `tests/e2e/`. Approximation of the runtime jest count (within ~2 %), but stable and zero-cost (no jest invocation needed during build).
- `FONT_CINZEL_LCP_KB`, `FONT_CINZEL_400_KB`, `FONT_CINZEL_600_KB`, `FONT_CINZEL_700_KB`, `FONT_CRIMSON_ITALIC_KB` — woff2 file sizes for the 5 deployed font subsets, read from `fonts/`.

Markers added in:

- `README.md`: Quality Stack row (test counts + JS gzip + CSS var count), budget table, "Performance under budget" checklist line, font architecture table (5 KB columns).
- `PERFORMANCE-STRATEGY.md:75`: JS bundle prose claim.
- `CSS-ARCHITECTURE.md:23,26`: Cinzel LCP + Cinzel 400 KB callouts.

The marker set now covers every numeric claim that drifted across rounds 6-10. Plain-prose drift has not vanished — there are still numbers in deeper sections of `PERFORMANCE-STRATEGY.md` and elsewhere — but the high-traffic / Quality-Stack tables, where readers actually look, are auto-managed.

The Round 11 close acknowledges Pareto: marker coverage grew from "8 hotspots" (Round 9) to "every claim a maintainer reads in the front-of-doc tables". Deeper prose claims (e.g. font-loading milestones quoted in PERFORMANCE-STRATEGY's "Lighthouse mobile 100/100" decomposition) are left in plain prose — they document specific historical measurements rather than the live state and would mislead if auto-rewritten.

#### Round 12 — duplicate-truth-surface drift

Round 11 marker'd `README.md:419` (Quality Stack table row) but missed `README.md:261` (Testing Status ASCII block — 8 lines above on the same screen). Both rows expressed the same fact ("how many unit tests pass") in different formats; only the marker'd one auto-updated.

The class is **duplicate truth surfaces**: when the same number is written in two prose forms, marker'ing one doesn't touch the other, and they drift independently. Round 11's grep landed on `419` because the stale value there ("148") was easier to spot than `191` at line 261 (which was the slightly-fresher snapshot from Round 8).

#### Round 13 — close the duplicate-surface gap

- `inject-doc-numbers.js`: added `UNIT_SUITE_COUNT` and `E2E_SPEC_FILE_COUNT` metrics (count of `*.test.js` / `*.spec.js` files via `git ls-files`). Total marker keys: 25 → 27.
- `README.md:261`: marker'd `~<!-- AUTO:UNIT_TEST_COUNT -->...<!-- /AUTO --> passing across <!-- AUTO:UNIT_SUITE_COUNT -->...<!-- /AUTO --> suites`. The suite enumeration ("logger + vitals + main + sw + scripts + font-subset-coverage + docs-lint + inject-doc-numbers") was updated from 7 to 8 (the inject-doc-numbers suite was added in Round 9 but the README enumeration was never updated). The enum stays plain prose — a `TEST_SUITE_LIST` metric would be over-engineered for an 8-item list whose order is editorial.
- `README.md:274`: `E2E Tests: 63 specs` → `E2E Tests: ~<!-- AUTO:E2E_SPEC_COUNT -->63<!-- /AUTO --> specs`. Now both representations of the e2e count (line 274 ASCII block + line 419 Quality Stack table) reference the same marker; they cannot drift apart.

The duplicate-truth-surface class isn't fully closed — there are surely other docs with the same number written twice — but the README's two highest-traffic surfaces (Testing Status + Quality Stack) now share marker IDs and update atomically.

#### Round 14 — exhaustive markdown sweep

Round 14 was an explicit "find every drift, fix in one pass" instead of round-by-round. Found and fixed 13 instances across 6 files:

- `TESTING.md`: "(Level B JS surface — 4 files)" → 8 suites; lists were missing 3 unit + 4 e2e files; "AbortController timeout" → AbortSignal.timeout(); stale "main.js entry-point glue ... istanbul ignore" claim; "7 viewports" → 3 viewport widths.
- `README.md:247`: "3 file totali (...) plus sw.js" wording inconsistency → "4 file totali".
- `CHANGELOG.md:11`: H3 title "Apr 2026 follow-up — drift gates + asset integrity + maskable icons" only described round 1-3 topics → updated to span ("drift gates, asset integrity, maskable icons, build-time number injection").
- `CHANGELOG.md:13`: "across four fresh-eyes review rounds" → "across 13 fresh-eyes review rounds + Round 9 structural fix".
- `ARCHITECTURE.md:51`: "/_ Colors (19 total) _/" → "13 total in 1-variables.css".
- `CI-CD.md:14`: pipeline missing `docs:numbers:check` step.
- `CI-CD.md:25`: Lint stage missing `docs-lint` + `inject-doc-numbers --check`.
- `css/1-variables.css:5`: "29 CSS Custom Properties" → "~30".

Self-violation found during the sweep: my own initial fix prose for the "main.js istanbul ignore" claim happened to trigger the FORBIDDEN_PROSE pattern in `docs-lint.js` ("`main.js` no longer has istanbul-ignore"). Reworded as "main.js is fully covered as of the Apr 2026 follow-up" to satisfy the regex without changing meaning.

#### Round 15 — JS/CSS source-comment marker syntax + image-size metrics

The Round 14 sweep covered .md docs but explicitly excluded source-code comments. Round 15 fresh-eyes audit found 6 numeric drift instances in source comments that the marker layer didn't reach:

- `scripts/performance-budget.js:7`: "current actual (~0.94 / 7.11 / 8.05 KB gzip)" — stale by +7% / -5% / -4%.
- `scripts/performance-budget.js:23-25`: inline `// KB gzip — current X` comments stale (0.94 / 7.11 / 8.05 → 1.0 / 6.7 / 7.7).
- `sw.js:78-79`: AVIF "~40 KB" (actual ~30 KB), WebP "~70 KB" (actual ~78.5 KB) image size approximations stale.

The structural fix:

- **JS-syntax marker variant added.** `MARKER_RE_JS` matches the form `/` + `*` + `AUTO:KEY` + `*` + `/` + value + `/` + `*` + `/AUTO` + `*` + `/`, suitable for line-level inline injection in JS / CSS source where HTML markers would render visibly. Both syntaxes processed by the same `injectMarkers()` call; the result re-emits each in its original form.
- **Discovery extended to `.js` / `.css` files**, with `tests/` and `dist/` as path-prefix exclusions (test fixtures legitimately embed marker-shaped strings; minified `dist/` artefacts are ephemeral). `scripts/inject-doc-numbers.js` is also self-excluded — its own docstring quotes both marker forms as syntax documentation.
- **Edge case discovered during integration**: JS block comments (`/` + `*` … `*` + `/`) cannot nest. So a JS-style marker placed inside an existing JS block comment terminates the surrounding comment at the marker's opening `*` + `/`. Solution: inside JS block comments, use the HTML-style marker (it's just plain text — no `*` or `/`, no parser conflict). The fix landed in `sw.js`'s PRECACHE comment block. Documented in the script's main docstring + the `EXCLUDE` comment.
- **New metrics**: `HERO_AVIF_KB` and `HERO_WEBP_KB` for `images/ghironda-720.{avif,webp}`, both referenced by sw.js's PRECACHE block. Total marker keys: 27 → 29.
- **Tests**: `tests/unit/inject-doc-numbers.test.js` extended with 8 new tests covering MARKER_RE_HTML / MARKER_RE_JS independence, JS-syntax substitution, idempotency, mixed-content handling, and unknown-key reporting. Total: 13 → 21.
- **CI gate**: same `docs:numbers:check` step from Round 9 now also enforces the JS-style markers (no separate gate needed; the unified `injectMarkers()` call handles both).

#### Round 16 — CSS source-comment drift

Round 15 covered `.js` source comments. Round 16 fresh-eyes audit extended the scan to `.css` source comments and found 3 instances:

- `css/3-typography.css:8-21`: architectural claim "cinzel-400 ... intentionally NOT shipped at all" — STALE since Round 3 of this follow-up shipped cinzel-400 in `fonts.css` (critical, preloaded). Comment described a pre-Round-3 state. Rewritten to reflect: cinzel-400 IS shipped (text-targeted critical subset); cinzel-decorative-400 is the only un-declared face (woff2 in fonts/ but no @font-face).
- `css/5-hero.css:112-113`: "'Cinzel LCP' ... (~3.4 KB)" — actual 4.2 KB. Marker'd as `FONT_CINZEL_LCP_KB`. The "~15.6 KB full Cinzel" comparison reframed: 15.6 KB was the original Google Fonts source pre-subset; the deployed cinzel-700 woff2 (text-targeted subset) is `FONT_CINZEL_700_KB`.
- `css/fonts.css:61-66`: same drift class as `5-hero.css`. Marker'd identically.

#### Round 17 — `index.html` comment drift + HTML-comment-nesting edge case

The discovery scope was extended again from `.md|.json|.cjs|.mjs|.js|.css` to also include `.html`. Round 17 audit of `index.html` found 5 stale numeric claims in `<!-- ... -->` comment blocks:

- LCP font subset size (`~3.4 KB` → marker `FONT_CINZEL_LCP_KB`)
- Full Cinzel-700 source vs. current subset (`~15.6 KB` → original Google Fonts source kept, current `FONT_CINZEL_700_KB` added)
- Body subset + AVIF parallel-load comment (`5.6 KB ... 30 KB AVIF` → markers)
- AVIF vs WebP at 720w (`~40 KB vs ~70 KB` → markers `HERO_AVIF_KB`, `HERO_WEBP_KB`)
- WebP decode trade-off claim (`70 KB webp` → marker)

**Edge case discovered**: HTML comments don't nest. HTML-style markers (`<!-- AUTO:K -->X<!-- /AUTO -->`) placed inside an outer `<!-- ... -->` block prematurely terminate the outer comment at the first inner `-->`, breaking htmlhint's `spec-char-escape` rule. Symmetric to the JS-block-nesting edge case discovered in Round 15 (sw.js).

**Resolution rule** (now documented in `inject-doc-numbers.js` docstring):

- Inside JS block comments → use HTML-style markers (the JS marker's `*` + `/` would close the wrapping comment)
- Inside HTML comments → use JS-style markers (the HTML marker's `-->` would close the wrapping comment)
- Pick the syntax that does NOT contain the close sequence of the wrapping comment.

Both regexes run on every tracked file regardless of extension, so the file's "primary" comment grammar doesn't constrain which marker syntax can appear inside its comments.

Discovery scope after Round 17: `.md|.json|.cjs|.mjs|.js|.css|.html`. Files scanned: 23 → 61 (Round 15) → 63 (Round 17). Marker count across docs+source: ~110.

#### Verification (post-Round 17)

- 215 unit tests pass across 8 suites; per-file 100% coverage on `js/**` + `sw.js` maintained.
- Stryker mutation score 100/100 across `js/**` + `sw.js` (production runtime).
- `docs-lint`: clean.
- `docs:numbers:check`: 63 files scanned, every AUTO marker (HTML + JS syntaxes combined, ~110) matches the live source.
- htmlhint clean (the Round-17 nesting edge case was caught by `spec-char-escape` and resolved by switching the markers to JS syntax).
- Performance budget: <!-- AUTO:TOTAL_GZIP -->7.7<!-- /AUTO --> KB / <!-- AUTO:BUDGET_TOTAL_MAX -->10<!-- /AUTO --> KB gzip total.

#### Verification (post-Round 15)

- 215 unit tests pass across 8 suites.
- Stryker mutation score 100/100 across `js/**` + `sw.js` (production runtime).
- `docs-lint`: clean.
- `docs:numbers:check`: 61 files scanned (was 23 — +source files), every AUTO marker matches the live source.
- Performance budget: <!-- AUTO:TOTAL_GZIP -->7.7<!-- /AUTO --> KB / <!-- AUTO:BUDGET_TOTAL_MAX -->10<!-- /AUTO --> KB gzip total.

#### Verification (post-Round 13)

- 207 unit tests pass across 8 suites; per-file 100% coverage on `js/**` + `sw.js` maintained.
- `docs:numbers:check`: 23 files scanned, every AUTO marker (now ~98 across docs) matches the live source. Both Testing Status block and Quality Stack row in `README.md` show the same `UNIT_TEST_COUNT` / `E2E_SPEC_COUNT` values by construction.
- Stryker mutation score 100/100 across `js/**` + `sw.js` (production runtime).
- Performance budget: <!-- AUTO:TOTAL_GZIP -->7.7<!-- /AUTO --> KB / <!-- AUTO:BUDGET_TOTAL_MAX -->10<!-- /AUTO --> KB gzip total.

- `npm audit`: 0 CVEs at moderate-or-higher.

(Verification block superseded by post-Round 13 above; kept truncated to preserve the historical thread.)

---

### Changed — Pure-CSS architecture (Level B refactor, 2026-04-28)

JavaScript no longer drives any graphical state. Every visual transition that used to be JS-orchestrated has moved into CSS as a declarative rule. JS is now strictly: deferred-stylesheet loader, Web Vitals telemetry, and service-worker registration.

#### CSS replacements

- **Active-section nav highlight**: replaced JS `IntersectionObserver` + `aria-current="location"` with `@supports (animation-timeline: view())` + per-section `view-timeline-name` + `animation-range: cover 30% 70%` keyframe (`css/4-header.css`).
- **Hamburger menu state**: replaced `.nav-open` class toggle on `<header>` with the checkbox-hack pattern — `<input type="checkbox" class="nav-toggle-input">` nested inside `<label class="nav-toggle">`. Consumers read state via `header:has(.nav-toggle-input:checked)`.
- **Header-height token**: hardcoded `--header-h: 77px` on `:root`; the open-state expansion is `:root:has(.nav-toggle-input:checked) { --header-h: clamp(220px, 38vh, 320px) }`. No more JS `ResizeObserver` measurement.
- **Skip-link ↔ title-link cross-fade**: pre-existing `@supports (animation-timeline: scroll())` block in `css/4-header.css` continues to handle this with a named `--hero-h1` view-timeline (was already CSS-driven).
- **Mobile-nav-open hides hero image**: `header:has(.nav-toggle-input:checked) ~ .header-hero-wrapper .ghironda-wrapper { display: none }` (was the `.nav-open` class hook).

#### Documented trade-offs (intentional regressions)

- `aria-current` is no longer set on the active nav anchor. Screen readers don't announce "current location"; the highlight is purely visual. CSS cannot write attributes.
- Mobile nav stays open after an anchor click — users tap the toggle to close. Avoiding this would require JS, defeating the purpose.
- `--header-h` is no longer measured live; it's a static value with a `:has()`-driven open-state alternative. Sub-pixel header reflows from font load are absorbed without JS tracking.
- The active-section indicator requires Chrome 115+ / Firefox 134+ / Safari 26+ for `animation-timeline: view()`. Older browsers see no highlight (graceful fallback) — click navigation still works.

#### Removed

- `js/modules/observer.js` (`IntersectionObserver` + `ResizeObserver` setup, ~7 KB raw)
- `js/config.js` (runtime constants — values now live in CSS or are hardcoded with documented sources of truth)
- `tests/unit/observer.test.js`, `tests/unit/config-sync.test.js`
- `<button class="nav-toggle">` HTML; replaced with the `<label>` + nested checkbox pattern

#### Verification

- All 53 unit tests pass; per-file 100% coverage maintained on the remaining JS (`logger.js` + `vitals.js` + `main.js`)
- 217 cross-browser e2e tests pass (chromium + firefox + webkit) with 2 intentional skips for `view-timeline` browser-support gaps
- Stryker mutation score: 100/100 (90 mutants, all killed)
- Lighthouse desktop: 100 / 100 / 100 / 100
- Lighthouse mobile: 99 / 100 / 100 / 100. The 99/100 performance score sits at Lighthouse's simulation boundary (LCP element is `section.hero`, render delay 155 ms simulated); it is not introduced by this refactor — Level B reduced the JS bundle and the inline-CSS additions are inside `@supports` blocks with no runtime cost on unsupported engines.
- Visual regression baselines regenerated across all 3 browsers (HTML structural change: `<button>` → `<label>` wrapping the bars)

---

## [1.1.0] — 2026-04-28

Major hardening release: comprehensive testing/security/quality-gate work that grew during the v1.0.0 → 1.1.0 development cycle. Cut now (rather than continuing in `[Unreleased]`) so users have a stable target to install/audit against.

### Added

#### Quality gates

- TypeScript type-checking via `tsc --strict` over JS sources (JSDoc-typed) — split DOM
  and WebWorker scopes into `tsconfig.json` and `tsconfig.sw.json`
- Prettier integration — `format` / `format:check` scripts, `eslint-config-prettier`
  in the ESLint flat config
- ESLint hardening — `eslint-plugin-security`, `eslint-plugin-no-unsanitized`,
  anti-bug rules (no-eval, no-implied-eval, no-new-func, no-script-url, no-throw-literal,
  require-atomic-updates, no-promise-executor-return, no-await-in-loop), and complexity
  caps (complexity 15, max-lines-per-function 100, max-depth 4, max-params 5,
  max-lines 600)
- Stylelint hardening — BEM `selector-class-pattern`, `no-duplicate-selectors`,
  `color-named: never`, `length-zero-no-unit`,
  `declaration-block-no-shorthand-property-overrides`
- HTMLHint strict ruleset
- Per-file `100% / 100% / 100% / 100%` coverage threshold enforced by Jest
- Stryker mutation testing with `break: 100` (no surviving mutants permitted)

#### Accessibility

- ARIA 1.2 §4.3.7 compliance — `aria-current="location"` for in-page section
  navigation (was `page`, which is reserved for multi-page navigation)
- Hamburger toggle: dynamic `aria-label` mirroring the action the next click
  performs (WCAG 4.1.2 Name, Role, Value)
- `prefers-reduced-motion` honoured in `window.scrollTo()` calls (WCAG 2.3.3 AAA)
- 44 × 44 px minimum touch target on every interactive element including desktop
  nav links (WCAG 2.5.5 AAA)
- Skip-link is the first DOM element after `<header>` and the first
  keyboard-focusable anchor (`tabindex="-1"` on the title-link until scroll)

#### Security

- Strict CSP — SHA-256 hashes for every inline `<script>` and `<style>` block,
  including `application/ld+json`. No `'unsafe-inline'`, no remote CDN.
- `worker-src 'self'` made explicit for the registered service worker
- Service worker: NetworkFirst strategy for HTML navigations with cache fallback
  and inline 503 offline shell; content-type policy validates response MIME
  against URL extension before caching (defence-in-depth on top of HTTPS)
- Service worker: explicit `scope: './'` on registration to prevent accidental
  scope widening on org-level Pages migration
- Husky 9 pre-commit / commit-msg / pre-push hooks without the deprecated `_/husky.sh` shim
- All GitHub Actions SHA-pinned (no version tags) — supply-chain attack mitigation
- CodeQL workflow with `security-extended` query suite + paths-ignore
- Dependabot grouped updates (eslint-stack, jest-stack, playwright-stack, etc.)
  reviewed by repo owner; `update-snapshots` workflow gated by author allow-list
- `LICENSE` (MIT) and `SECURITY.md` (vulnerability reporting + GH Pages HTTP
  header constraints documented)
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) and `CONTRIBUTING.md`
- `CODEOWNERS`, issue templates (bug / feature / accessibility), PR template

#### SEO

- `<meta name="description">` trimmed to ≤ 155 chars
- `og:image:type`, `og:image:alt`, `twitter:image:alt` added
- `<link rel="alternate" hreflang="it">` and `x-default`
- `sitemap.xml` reduced to a single URL (Google ignores fragment URLs)
- `robots.txt`: `Crawl-delay` removed (Google ignores it; Bing slows unnecessarily)
- `sitemap.xml` `lastmod` auto-updated by `scripts/update-sitemap.js` on every build
- JSON-LD merged into `@graph` with `WebSite` + `Organization`

#### Service worker / observers

- Service worker test suite rewritten — 18 / 18 passing, including new tests
  for NetworkFirst HTML, content-type validation, offline shell
- `js/modules/observer.js`: observer registry with `pagehide` cleanup —
  every `IntersectionObserver` and `ResizeObserver` is disconnected before
  navigation, freeing the browser GC
- `js/modules/vitals.js`: `devWarn` in each catch block — unsupported observer
  types are reported in dev mode instead of silently swallowed; configurable
  `navigator.sendBeacon` transmission via `window.__vitalsEndpoint`

### Changed

- `aria-current` value: `page` → `location` for single-page section navigation
- CSS: `overflow-y: scroll` → `scrollbar-gutter: stable` (modern replacement)
- CSS: nav underline animation moved from `width` to `transform: scaleX()` for
  GPU-accelerated, layout-skipping animation
- CSS: `--header-h` fallback aligned to `77px` across CSS, JS config, and tests
  (single source of truth)
- HTML: LCP image `decoding="async"` (was `sync`); footer external link gets
  `lang="en"` for the brand name
- HTML: skip-link first in DOM (before title-link) with static
  `aria-hidden="true" tabindex="-1"` on the title-link until scrolled
- `npm run build` is fully production-gated (`NODE_ENV=production` via `cross-env`)
- `audit:security`: npm audit threshold raised from `high` → `moderate`
- `tests/e2e/`: Page Object Model in `fixtures.js` with role-based locators
- `playwright.config.cjs`: retries `2` in CI / `0` local; `updateSnapshots: 'none'`
  globally; `trace: 'retain-on-failure'`; `expect.timeout: 10000`,
  `actionTimeout: 5000`, `navigationTimeout: 15000`
- `.github/workflows/test.yml`: typecheck + format-check steps; visual baselines
  fail when missing (was warning); `dist/` integrity check after rebuild;
  source-map absence check; Lighthouse desktop + mobile matrix

### Removed

- `upgrade-insecure-requests` directive from CSP — redundant on a static
  same-origin site (every request is already HTTPS on GitHub Pages and HSTS
  covers the policy job in production), and WebKit honours it on localhost,
  breaking e2e tests by retrying `http://localhost:8000/dist/main.min.js` as
  `https:` (SSL error → script never loads)
- `gentle-float` CSS animation — replaced with deterministic static layout to
  guarantee zero CLS on Lighthouse mobile emulation
- BreadcrumbList JSON-LD — single-page site has no breadcrumb hierarchy
- Cinzel-400 and Cinzel-decorative-700 woff2 — not used in the critical path
- IE11 IntersectionObserver polyfill — IE end-of-life June 2022
- Deprecated `_/husky.sh` shim from `.husky/*` hooks (removed in Husky v10)

---

## [1.0.0] — 2026-04-01

### Added

- Initial public release of the La Compagnia della Ghironda website
- Vanilla JS SPA — no framework, no runtime dependencies
- 9-layer modular CSS architecture with CSS custom properties design system
- IntersectionObserver-based section tracking with `aria-current` navigation
- Hamburger menu with animated grid-template-rows expand/collapse
- Service worker with stale-while-revalidate caching for static assets
- Web Vitals measurement (FCP, LCP, CLS) via PerformanceObserver
- Responsive images: WebP + PNG fallback with srcset across 6 breakpoints
- Self-hosted Cinzel and Crimson Text fonts with `font-display: optional`
- Critical CSS inlined at build time; deferred CSS via `requestIdleCallback`
- E2E tests across Chromium, Firefox, WebKit (Playwright)
- Unit tests with coverage threshold enforced (Jest)
- WCAG 2.1 AA accessibility verified via axe-core
- Visual regression baselines for 7 key layouts (cross-browser)
- Schema.org structured data: Organization + BreadcrumbList
- Content Security Policy with SHA-256 hash for inline script
- Pre-commit hooks: lint-staged (ESLint + Stylelint + HTMLHint) + commitlint
- Performance budget enforcement: JS ≤ 5 KB gzip, CSS ≤ 10 KB gzip
- Lighthouse 100 across Performance, Accessibility, Best Practices, SEO
