/**
 * Jest Setup File
 * Configures DOM environment, testing library matchers, and global mocks
 */

require('@testing-library/jest-dom');

// Mock window.requestIdleCallback for browsers that don't support it
if (!global.requestIdleCallback) {
  global.requestIdleCallback = (callback) => setTimeout(callback, 0);
}

// Mock window.cancelIdleCallback
if (!global.cancelIdleCallback) {
  global.cancelIdleCallback = (id) => {
    clearTimeout(id);
  };
}

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
  value: jest.fn().mockImplementation(query => ({
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

// Suppress console output in tests unless explicitly requested
const originalError = console.error;
const originalWarn = console.warn;

global.testLog = {
  errors: [],
  warnings: [],
};

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
