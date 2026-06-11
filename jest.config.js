'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  forceExit: true,
  collectCoverageFrom: [
    'routes/pieces.js',
    'routes/settings.js',
    'routes/activity.js',
  ],
  coverageThreshold: {
    global: { statements: 75, branches: 60, functions: 75, lines: 75 },
  },
};
