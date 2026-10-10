const chromeGlobal = {
  chrome: 'readonly',
};
const browserGlobals = {
  document: 'readonly',
  window: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  location: 'readonly',
  AbortSignal: 'readonly',
  Blob: 'readonly',
  TextDecoder: 'readonly',
  setTimeout: 'readonly',
  globalThis: 'readonly',
};

const rules = {
  'no-unused-vars': 'error',
  'no-undef': 'error',
  'eqeqeq': 'error',
  'no-var': 'error',
  'prefer-const': 'error',
};

export default [
  {
    ignores: ['vendor/**', 'node_modules/**'],
  },
  {
    files: ['*.js', 'lib/**/*.js'],
    ignores: ['*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...chromeGlobal, ...browserGlobals },
    },
    rules,
  },
  {
    files: ['offscreen.js'],
    languageOptions: {
      globals: { JSZip: 'readonly', muxjs: 'readonly' },
    },
  },
  {
    files: ['tests/**/*.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      ...rules,
      'no-undef': 'off', // Playwright globals (test, expect) come from imports
    },
  },
];
