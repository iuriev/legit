/** End-to-end tests: the real application against PostgreSQL started by Testcontainers. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'test',
  testRegex: '\\.e2e-spec\\.ts$',
  setupFiles: ['reflect-metadata'],
  globalSetup: '<rootDir>/global-setup.ts',
  globalTeardown: '<rootDir>/global-teardown.ts',
  testTimeout: 30000,
  // One database is shared by all files, so they must not run in parallel.
  maxWorkers: 1,
};
