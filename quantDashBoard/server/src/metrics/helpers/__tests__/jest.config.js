export default {
  transform: {},
  testMatch: ['<rootDir>/*.test.js'],
  rootDir: '.',
  moduleDirectories: ['node_modules'],
  verbose: true,
  bail: false,
  collectCoverageFrom: [
    '../riskMetrics.js',
    '../riskAdjustedMetrics.js',
    '../returnsMetrics.js',
    '../diversificationMetrics.js',
    '../dateRanges.js',
  ],
  coverageDirectory: './coverage',
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
