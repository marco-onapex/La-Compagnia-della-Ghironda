# CI / CD Pipeline

GitHub Actions enforces every quality, security, and performance gate that
matters before a change reaches `main` or a tag.

> **Source of truth**: `.github/workflows/`. This document is a high-level
> map — when a workflow changes, update the file there first, then this
> document.

## Workflows

| Workflow               | Trigger                                   | Jobs                                                                                                                                                         |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test.yml`             | push / PR on `main`, `develop`            | lint (incl. `docs:numbers:check` + `format:check` + `actionlint`) → unit-tests + e2e-tests (parallel) → build → lighthouse (matrix desktop+mobile) → summary |
| `ci-cd.yml`            | push / PR on `main`                       | seo-validation, security-audit, bundle-integrity, summary                                                                                                    |
| `deploy.yml`           | push on `main`, manual                    | build → verify `.deploy/` → orphan-commit + force-push to `gh-pages` (Round 20 source/deploy split)                                                          |
| `release.yml`          | manual `workflow_dispatch` (semver input) | validate-version → validate (unit + lint + typecheck + format + audit) + e2e-validate → build-release (with rebuild-integrity check) → lighthouse-gate       |
| `hotfix.yml`           | push on `hotfix/**`, manual               | lint (incl. typecheck + audit) → unit-tests → e2e-tests (chromium fast-path) → summary                                                                       |
| `codeql.yml`           | push / PR on `main`, weekly cron          | CodeQL analysis with `security-extended` query suite                                                                                                         |
| `update-snapshots.yml` | manual (gated by `environment + actor`)   | Regenerates Linux visual baselines, opens a PR                                                                                                               |

## Quality gates run by `test.yml`

| Stage                | Tools                                                                                                                  | Failure-mode                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint                 | ESLint 9 (flat config, security plugins) + Stylelint + HTMLHint + `docs-lint.js` (3-layer integrity gate) + actionlint | Any error or warning → fail                                                                                                                                                              |
| Type-check           | `tsc --strict` over `js/` (DOM) + `sw.js` (WebWorker) + `scripts/`                                                     | Any TS diagnostic → fail                                                                                                                                                                 |
| Format check         | Prettier `--check`                                                                                                     | Any unformatted file → fail                                                                                                                                                              |
| Unit tests           | Jest + 100% per-file coverage threshold (`jest.config.cjs`)                                                            | Coverage drift below 100% → fail; Codecov upload non-blocking                                                                                                                            |
| E2E tests            | Playwright (chromium + firefox + webkit), `workers=1`                                                                  | Any failure → fail; visual regressions tested against committed baselines                                                                                                                |
| Build                | `npm run build` full chain → `.deploy/`                                                                                | Any build error → fail. **Round-21 drift gate**: `git diff --exit-code` after `docs:numbers` step inside the `build` job catches any AUTO marker drift the contributor forgot to commit. |
| docs:numbers:check   | `inject-doc-numbers.js --check`                                                                                        | Belt-and-braces second pass after build (in test.yml `build` job, NOT lint, since it requires `.deploy/`).                                                                               |
| Visual baseline gate | `find tests/e2e/visual.spec.js-snapshots -name '*-linux.png'` vs. main                                                 | Round-21 hardening: PR with 0 baselines BUT main has baselines = **fail loud** (regression). Initial-seed mode (both 0) skips with warning.                                              |
| Lighthouse           | Mobile + Desktop matrix, 100/100/100/100 enforced via `scripts/enforce-lighthouse.js`                                  | Any score below threshold → fail. Best-of-3 retry mitigates simulator variance. `BLOCKING=true` env on release.yml ensures release gate is non-bypassable.                               |

## Pinning & supply-chain

- Every action is pinned by full commit SHA (`actions/checkout@<sha>`,
  `actions/setup-node@<sha>`, …) — version tags are hint-comments only.
- `Dependabot` (`.github/dependabot.yml`) groups upgrades by ecosystem
  (eslint-stack, jest-stack, playwright-stack, security-stack, …) so the
  reviewer sees one PR per stack instead of N per package.
- `CodeQL` runs the `security-extended` query suite weekly + on every PR.
- The `update-snapshots` workflow is double-gated: GitHub Environment with
  required reviewer **and** an inline `github.actor` allow-list.

## Cache strategy

All workflows share the cache key shape `${runner.os}-nm-${CACHE_VERSION}-node${NODE_VERSION}-${hashFiles('**/package-lock.json')}`.
The `node${NODE_VERSION}` discriminator means a Node-version bump invalidates
the cache automatically — preventing cross-version `node_modules` reuse, which
historically produced subtle native-binding mismatches (sharp, esbuild).

## Local equivalents

| CI gate            | Local command                            |
| ------------------ | ---------------------------------------- |
| Lint everything    | `npm run lint:parallel`                  |
| Type-check         | `npm run typecheck`                      |
| Format check       | `npm run format:check`                   |
| Unit tests         | `npm run test:unit:ci`                   |
| Mutation tests     | `npm run test:mutation`                  |
| E2E (one browser)  | `npm run test:e2e -- --project=chromium` |
| E2E (all browsers) | `npm run test:e2e`                       |
| Lighthouse desktop | `npm run audit:lighthouse:desktop`       |
| Lighthouse mobile  | `npm run audit:lighthouse:mobile`        |
| Full prod-shipping | `npm run prod`                           |

`npm run check` is the fast pre-commit gate (clean dist/ + test:fast).
`npm run prod` is the full-shipping gate (test:all + build).
