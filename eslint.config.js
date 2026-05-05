import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jest from 'eslint-plugin-jest';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import playwright from 'eslint-plugin-playwright';
import promise from 'eslint-plugin-promise';
import security from 'eslint-plugin-security';
import unicorn from 'eslint-plugin-unicorn';

const browserGlobals = {
  document: 'readonly',
  window: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  performance: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  requestIdleCallback: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  CustomEvent: 'readonly',
  URLSearchParams: 'readonly',
  URL: 'readonly',
  Blob: 'readonly',
  ArrayBuffer: 'readonly',
  AbortController: 'readonly',
  Math: 'readonly',
  Intl: 'readonly',
  DOMParser: 'readonly',
  PerformanceObserver: 'readonly',
  getComputedStyle: 'readonly',
  HTMLElement: 'readonly',
  Element: 'readonly',
  Event: 'readonly',
  EventSource: 'readonly',
  MouseEvent: 'readonly',
  /* CSS feature-detection global (`CSS.supports(...)`) — used by
     header-toggle.js to gate against engines that own the swap via
     scroll-driven animation. */
  CSS: 'readonly',
  /* IntersectionObserver — used by header-toggle.js as the
     fallback path when CSS scroll-driven animation is absent. */
  IntersectionObserver: 'readonly',
};

const nodeGlobals = {
  process: 'readonly',
  module: 'writable',
  require: 'readonly',
  global: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  URL: 'readonly',
};

const testGlobals = {
  ...browserGlobals,
  ...nodeGlobals,
  describe: 'readonly',
  it: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  jest: 'readonly',
  test: 'readonly',
  axe: 'readonly',
  devices: 'readonly',
};

// Shared strict rules added on top of recommended across all groups.
// Anti-bug rules (no-eval, no-throw-literal, etc.) catch foot-guns at
// commit time; complexity caps stop bootstrap files from drifting into
// unmaintainable territory.
const strictRules = {
  'prefer-const': 'error',
  eqeqeq: 'error',
  'no-var': 'error',
  'no-shadow': 'error',
  'object-shorthand': 'error',
  curly: ['error', 'all'],

  // Anti-bug — eval & friends
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',

  // Anti-bug — throwing
  'no-throw-literal': 'error',

  // Anti-bug — async correctness
  'no-promise-executor-return': 'error',
  'require-atomic-updates': 'error',
  'no-return-await': 'error',
  'no-await-in-loop': 'warn',

  // Anti-bug — control flow
  'no-self-compare': 'error',
  'no-unmodified-loop-condition': 'error',
  'no-unreachable-loop': 'error',
  'no-constant-binary-expression': 'error',

  // Complexity caps — keep bootstrap and analytics modules from
  // accumulating accidental complexity. Under Level B the JS surface
  // is small (main.js + logger + vitals + sw); these caps are headroom.
  complexity: ['error', { max: 15 }],
  'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }],
  'max-depth': ['error', 4],
  'max-params': ['error', 5],
  'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],

  // Restricted syntax — block surprise APIs
  'no-restricted-syntax': [
    'error',
    {
      selector: "CallExpression[callee.name='setInterval']",
      message: 'Use requestAnimationFrame or setTimeout chains; setInterval drifts under load.',
    },
    {
      selector: "MemberExpression[object.name='Date'][property.name='now']",
      message: 'Use performance.now() in browser code; Date.now() acceptable only in Node tests.',
    },
  ],
};

// Promise plugin recommended rules — applied to every JS group below.
// Catches floating promises, missing await on .then/.catch, return-in-finally.
const promiseRules = {
  ...promise.configs['flat/recommended'].rules,
};

// Curated unicorn rules — bug-finding subset. We pick out the rules that
// catch real defects (regex injection, instanceof Array, thenable accidents)
// or canonicalise modern JS (string methods, array methods) and skip the
// purely-stylistic ones (filename-case, prevent-abbreviations, no-null,
// no-array-for-each) that produce churn without bug-finding value.
const unicornRules = {
  'unicorn/error-message': 'error', // throw new Error('') — empty messages
  'unicorn/escape-case': 'error', // \xa9 → \xA9
  'unicorn/no-array-method-this-argument': 'error', // .map(fn, thisArg) — almost always wrong
  'unicorn/no-array-push-push': 'error', // .push(a); .push(b) → .push(a, b)
  'unicorn/no-instanceof-array': 'error', // instanceof Array (frame-bound) → Array.isArray
  'unicorn/no-invalid-fetch-options': 'error', // body on GET, etc.
  'unicorn/no-invalid-remove-event-listener': 'error', // removeEventListener with bound fn ≠ original
  'unicorn/no-thenable': 'error', // accidental thenables
  'unicorn/no-unnecessary-await': 'error', // await on non-promise
  'unicorn/no-useless-fallback-in-spread': 'error', // {...(x ?? {})}
  'unicorn/no-useless-promise-resolve-reject': 'error', // return Promise.resolve(x) inside async
  'unicorn/no-useless-spread': 'error', // [...x] when not needed
  'unicorn/no-zero-fractions': 'error', // 1.0 → 1
  'unicorn/prefer-array-find': 'error', // arr.filter()[0] → arr.find()
  'unicorn/prefer-array-flat-map': 'error', // .map().flat() → .flatMap()
  'unicorn/prefer-array-some': 'error', // .find() !== undefined → .some()
  'unicorn/prefer-blob-reading-methods': 'error', // newer Blob.text/arrayBuffer over FileReader
  'unicorn/prefer-default-parameters': 'error', // x = x || 'default' → fn(x = 'default')
  'unicorn/prefer-includes': 'error', // indexOf(x) !== -1 → includes(x)
  'unicorn/prefer-modern-dom-apis': 'error', // .insertBefore → .before/.after/.replaceWith
  'unicorn/prefer-modern-math-apis': 'error', // Math.log(x) / Math.LN2 → Math.log2(x)
  'unicorn/prefer-node-protocol': 'error', // require('fs') → require('node:fs')
  'unicorn/prefer-number-properties': 'error', // isNaN → Number.isNaN
  'unicorn/prefer-regexp-test': 'error', // .match(re) for boolean → re.test()
  'unicorn/prefer-set-has': 'error', // arr.includes() inside loop → set.has()
  'unicorn/prefer-string-replace-all': 'error', // .replace(/g, '') → .replaceAll()
  'unicorn/prefer-string-slice': 'error', // .substr / .substring → .slice
  'unicorn/prefer-string-starts-ends-with': 'error', // .indexOf(x) === 0 → .startsWith(x)
  'unicorn/throw-new-error': 'error', // throw Error('') → throw new Error('')
};

// Import order + no-cycle — applied to every ESM group.
// `import/order` enforces: builtin → external → internal → parent → sibling, with
// blank lines between groups. `import/no-cycle` blocks circular module graphs.
const importRules = {
  'import/order': [
    'error',
    {
      groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
      'newlines-between': 'always',
      alphabetize: { order: 'asc', caseInsensitive: true },
    },
  ],
  'import/no-cycle': ['error', { maxDepth: 10 }],
  'import/no-duplicates': 'error',
};

const promisePluginRegistration = { promise };

export default [
  {
    // *.cjs removed — jest/babel/playwright configs are linted in the CJS block below.
    // node_modules/ already covers transitive .cjs files in dependencies.
    ignores: [
      'node_modules/',
      'dist/',
      /* Round 20 (option B): `.deploy/` carries the built artefact —
         minified JS, stripped HTML, copied static assets. Linting it
         would emit hundreds of errors on the minified bundles
         (`max-lines-per-function`, `complexity`, etc.) and serves no
         purpose: source under js/ + scripts/ is what's authored. */
      '.deploy/',
      'test-results/',
      '.eslintcache',
      'coverage/',
      'reports/',
      'playwright-report/',
      /* Binary PNG snapshots — ESLint would still skip them for content
         linting, but explicitly excluding the directory avoids spurious
         I/O on every run (~24 files at the moment, growing). */
      'tests/e2e/visual.spec.js-snapshots/',
    ],
  },

  // Dev logger — allowed to use console.warn (it's the whole point of the module)
  {
    files: ['js/modules/logger.js'],
    rules: {
      'no-console': ['error', { allow: ['warn'] }],
    },
  },

  // Browser/Client-side JavaScript
  {
    files: ['js/**/*.js'],
    plugins: { promise, import: importPlugin, unicorn, security, 'no-unsanitized': noUnsanitized },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...promiseRules,
      ...importRules,
      ...unicornRules,
      ...security.configs.recommended.rules,
      ...noUnsanitized.configs.recommended.rules,
      ...strictRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
    },
  },

  // Node.js ESM Scripts and Config Files
  {
    files: ['scripts/**/*.js', 'build*.js', '*.config.js', 'jest.setup.js'],
    plugins: { promise, import: importPlugin, unicorn },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...nodeGlobals,
        ...testGlobals,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...promiseRules,
      ...importRules,
      ...unicornRules,
      ...strictRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['log', 'error', 'warn'] }],
      // Node-side scripts run in Node, NOT in the browser; performance.now()
      // exists but Date.now() is canonical for build-time stamping.
      'no-restricted-syntax': 'off',
      // Build/audit scripts often have a single function that orchestrates
      // many sequential async steps — a hard 15 complexity cap is overkill.
      complexity: ['error', { max: 25 }],
      'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      'no-await-in-loop': 'off',
    },
  },

  // CommonJS config files (jest.config.cjs, babel.config.cjs, playwright.config.cjs)
  {
    files: ['*.cjs'],
    plugins: { ...promisePluginRegistration },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...promiseRules,
      ...strictRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['log', 'error', 'warn'] }],
    },
  },

  // Jest/Unit Tests — recommended rules from eslint-plugin-jest catch
  // common foot-guns: focused tests (test.only), expects outside test blocks,
  // disabled tests, identical titles, async work without await on expect.
  // Complexity caps are deliberately relaxed: test files legitimately have
  // long `describe` arrow bodies (each `test()` adds N lines).
  {
    files: ['tests/unit/**/*.js'],
    plugins: { jest, promise, import: importPlugin, unicorn },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: testGlobals,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...jest.configs['flat/recommended'].rules,
      ...promiseRules,
      ...importRules,
      ...unicornRules,
      ...strictRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Custom assertion helpers — `assertCoverage` in font-subset-coverage.test.js
      // wraps `expect()` with diff-friendly structuring. Whitelist its name so
      // `jest/expect-expect` doesn't flag the surrounding tests as
      // assertion-less. Adding new helpers? Append the function name here.
      'jest/expect-expect': ['error', { assertFunctionNames: ['expect', 'assertCoverage'] }],
      // Test-suite specific overrides:
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      complexity: 'off',
      'no-await-in-loop': 'off',
      'no-new-func': 'off', // sw.test.js evaluates sw.js source via new Function in a controlled scope
    },
  },

  // Service Worker — dual-mode classic script.
  //
  // The file defines `function setup(self, env)` and dispatches at the
  // bottom: invoked immediately under a worker scope (where `module` is
  // undefined), or exported via `module.exports` for CommonJS / Jest
  // require()-based testing. The `module` global is therefore in scope
  // even though sourceType is 'script'.
  //
  // Web globals (`self`, `caches`, `fetch`, `URL`, `Response`,
  // `AbortController`, `setTimeout`, `clearTimeout`) are referenced by
  // the dispatcher line `setup(self)` and by some of the setup() body's
  // default-parameter expressions; declaring them keeps `no-undef` quiet.
  {
    files: ['sw.js'],
    plugins: { ...promisePluginRegistration, security, 'no-unsanitized': noUnsanitized },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Response: 'readonly',
        AbortSignal: 'readonly',
        /* `console` is a legitimate Service Worker global (visible in
           DevTools → Application → Service Workers → console). The
           `no-console` rule below allows `warn` only — used for
           install-time precache misses (round 23). */
        console: 'readonly',
        module: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...promiseRules,
      ...security.configs.recommended.rules,
      ...noUnsanitized.configs.recommended.rules,
      ...strictRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn'] }],
      // setup() is the dual-mode bootstrap: it inlines all SW handler
      // registrations (install, activate, fetch) plus revalidate +
      // networkFirstHTML helpers. Extracting to outer scope would break
      // the dependency-injection closure that makes Stryker mutation
      // testing work. Hard cap at 200 lines for this single function.
      'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },

  // Playwright E2E Tests — recommended rules catch missing awaits on locators,
  // expects outside tests, page.waitForTimeout() (flaky), nested describe abuse,
  // use of waitForLoadState('networkidle'), conditional tests/expects.
  //
  // `playwright/no-skipped-test` is configured with `allowConditional: true`:
  // bare `test.skip()` (developer leftover) is still flagged, but the
  // documented cross-browser pattern `test.skip(browserName === 'webkit', '…')`
  // is permitted — it is the canonical way to skip a test programmatically
  // (Playwright docs `Test/skip()`). Without this option the rule would force
  // us back to `if (browserName==='webkit') return` which the no-conditional
  // rules then flag, an unwinnable cycle.
  {
    files: ['tests/e2e/**/*.js'],
    plugins: { playwright, promise, import: importPlugin, unicorn },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: testGlobals,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...playwright.configs['flat/recommended'].rules,
      ...promiseRules,
      ...importRules,
      ...unicornRules,
      ...strictRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'playwright/no-skipped-test': ['error', { allowConditional: true }],
      // E2E specs MUST import test/expect from the project's POM fixtures
      // file, not directly from @playwright/test. The fixtures wrap base
      // `test` with role-based locators and the `home.open()` helper —
      // bypassing them duplicates boilerplate and silently re-introduces
      // brittle CSS selectors. The fixtures file itself is excluded so it
      // can still depend on the upstream module.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              message:
                "Import `test` and `expect` from './fixtures.js' (or '../fixtures.js') instead — fixtures.js wraps base test with role-based locators and the home.open() helper.",
            },
          ],
        },
      ],
      // E2E-specific overrides:
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      complexity: 'off',
      'no-await-in-loop': 'off',
      // requestAnimationFrame(...resolve) inside `new Promise` is a documented
      // pattern (Playwright + MDN) for "wait one frame" — the executor
      // implicitly returns the rAF handle, which is harmless.
      'no-promise-executor-return': 'off',
    },
  },

  // The fixtures file itself MUST import from @playwright/test — it's the
  // module that wraps base test and re-exports it. Disable the restriction
  // for this single file.
  {
    files: ['tests/e2e/fixtures.js'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // Prettier MUST be last: disables ESLint formatting rules that would
  // conflict with Prettier's own formatting (semis, quotes, spacing).
  // ESLint keeps responsibility for code-correctness rules; Prettier
  // owns formatting.
  prettierConfig,
];
