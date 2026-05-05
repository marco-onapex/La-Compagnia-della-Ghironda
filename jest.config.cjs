/**
 * Jest Configuration for La Compagnia della Ghironda
 * Configures testing environment for JavaScript modules
 */

module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: './babel.config.cjs' }],
  },
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
  collectCoverageFrom: ['js/**/*.js', 'sw.js', '!js/**/*.test.js'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageThreshold: {
    // Coverage tightened to 100% across the board. Three branches in
    // js/modules/logger.js are genuinely untestable in jsdom (window.location
    // is locked: jsdom rejects both Object.defineProperty(window, 'location',
    // ...) and jest.spyOn(window.location, 'hostname', 'get'), so the
    // production-host branch and the 127.0.0.1 branch cannot be exercised
    // from a unit test). They carry `istanbul ignore` annotations with the
    // verification trail — see logger.js for the details. Production
    // behaviour for those branches is integration-verified on GH Pages.
    // Per-file mirrors the global so a single regression cannot hide.
    // sw.js sits at the repo root (not under js/) so it needs its own
    // pattern in collectCoverageFrom AND its own threshold entry — the
    // `./js/**/*.js` glob below would otherwise leave it uncovered by
    // the per-file gate even though tests/unit/sw.test.js exercises it.
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './js/**/*.js': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './sw.js': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  testTimeout: 10000,
};
