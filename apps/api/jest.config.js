/** Unit tests: fast, no database. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '\\.spec\\.ts$',
  setupFiles: ['reflect-metadata'],
};
