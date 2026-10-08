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
