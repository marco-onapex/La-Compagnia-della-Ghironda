import js from '@eslint/js';

const browserGlobals = {
  document: 'readonly',
  window: 'readonly',
  navigator: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  performance: 'readonly',
  requestIdleCallback: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  CustomEvent: 'readonly',
  URLSearchParams: 'readonly',
  ArrayBuffer: 'readonly',
  Math: 'readonly',
  Intl: 'readonly',
  IntersectionObserver: 'readonly',
  PerformanceObserver: 'readonly',
  getComputedStyle: 'readonly',
  HTMLElement: 'readonly',
  Element: 'readonly',
  Event: 'readonly',
};

const nodeGlobals = {
  process: 'readonly',
  module: 'readonly',
  require: 'readonly',
  global: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
};

const testGlobals = {
  ...browserGlobals,
  ...nodeGlobals,
  describe: 'readonly',
  it: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  jest: 'readonly',
  test: 'readonly',
  axe: 'readonly',
  devices: 'readonly',
};

export default [
  {
    ignores: ['node_modules/', 'dist/', 'test-results/', '.eslintcache', 'coverage/', '*.cjs']
  },
  // Browser/Client-side JavaScript
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: browserGlobals
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
    }
  },
  // Node.js Scripts and Config Files
  {
    files: ['scripts/**/*.js', 'build*.js', '*.config.js', 'jest.setup.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...nodeGlobals,
        ...testGlobals,
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['log', 'error', 'warn'] }],
    }
  },
  // Jest/Unit Tests
  {
    files: ['tests/unit/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: testGlobals
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    }
  },
  // Playwright E2E Tests
  {
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: testGlobals
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    }
  }
];
