/**
 * Jest Setup File
 * Configures DOM environment and global mocks
 */

// Mock document.fonts.ready for font loading detection
if (!document.fonts) {
  Object.defineProperty(document, 'fonts', {
    value: {
      ready: Promise.resolve(),
      check: () => true,
      delete: () => {},
      entries: () => [],
      load: () => Promise.resolve([]),
    },
    writable: true,
  });
}

// Mock window.matchMedia for media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Suppress console output in tests unless explicitly requested.
//
// Errors are buffered (not forwarded to the real console.error) so the test
// runner output stays clean during expected error-paths. The `afterEach`
// hook re-surfaces buffered errors as a thrown exception — silent errors
// cannot mask bugs because the throw fails the test loudly. Tests that
// intentionally produce a console.error must clear global.testLog.errors.
//
// Set DEBUG_TEST=1 in the environment to forward both error and warn live
// (useful when stepping through a flaky test).
//
// The patch is installed/removed per-test in a beforeEach/afterEach pair
// rather than once globally: a previous module-load global swap meant
// that any individual test using `jest.spyOn(console, 'error')` would
// be spying on our patched function (not the real console.error), and a
// stray `mockRestore()` would lose the patch entirely — letting later
// tests miss unexpected errors. Per-test install keeps every test
// observing the same baseline.
const originalError = console.error;
const originalWarn = console.warn;

global.testLog = {
  errors: [],
  warnings: [],
};

beforeEach(() => {
  global.testLog.errors = [];
  global.testLog.warnings = [];
  console.error = (...args) => {
    global.testLog.errors.push(args);
    if (process.env.DEBUG_TEST) {
      originalError(...args);
    }
  };
  console.warn = (...args) => {
    global.testLog.warnings.push(args);
    if (process.env.DEBUG_TEST) {
      originalWarn(...args);
    }
  };
});

afterEach(() => {
  /* Restore the real console BEFORE asserting on the buffered errors,
     so the assertion failure (if any) is reported through unpatched
     console.error and Jest's own reporters. */
  console.error = originalError;
  console.warn = originalWarn;
  const errors = global.testLog.errors.splice(0);
  if (errors.length > 0) {
    throw new Error(
      `Unexpected console.error in test:\n${errors.map((a) => a.join(' ')).join('\n')}`,
    );
  }
});
