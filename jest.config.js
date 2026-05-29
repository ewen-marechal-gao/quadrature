/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
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
