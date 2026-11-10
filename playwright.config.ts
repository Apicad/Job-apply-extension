import { defineConfig } from '@playwright/test';
import { FIXTURE_PORT } from './tests/fixtures/vite.config';

// End-to-end tests: real Chromium with the built extension loaded, run
// against the local fixture pages in tests/fixtures.
//
// Run with `npm run test:e2e` (it builds the `e2e` variant first).
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  // Every test launches its own browser with a fresh profile, so tests are
  // independent and can run in parallel.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'vite --config tests/fixtures/vite.config.ts',
    url: `http://127.0.0.1:${FIXTURE_PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
