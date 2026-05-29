/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // Remplace @node-llm/core (ESM-only) par un stub CJS pour les tests
  moduleNameMapper: {
    '^@node-llm/core$': '<rootDir>/tests/__mocks__/node-llm-core.js',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        // Extend the main tsconfig but allow tests/ in the rootDir
        strict: true,
        esModuleInterop: true,
        target: 'ES2022',
        module: 'CommonJS',
        moduleResolution: 'node',
        skipLibCheck: true,
        types: ['node', 'jest'],
      },
    },
  },
}
