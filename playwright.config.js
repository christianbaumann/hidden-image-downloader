import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Generous: every test drives a headed Chrome with the extension loaded, and Playwright
  // charges fixture teardown (closing that browser) against the same budget.
  timeout: 60000,
  retries: 0,
  reporter: 'list',
});
