import { execFileSync } from 'node:child_process';
import { defineConfig } from '@playwright/test';
// Keep application compilation independent of the owner-local fixture directory.
const FIXTURE_PORT = Number(process.env.JAA_FIXTURE_PORT ?? 5179);

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const source = { sha: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), branch: git('rev-parse', '--abbrev-ref', 'HEAD'), dirty: git('status', '--porcelain').length > 0 };
if (process.env.JAA_REQUIRE_CLEAN === '1' && source.dirty) throw Error('Release verification requires a clean committed checkout.');

// End-to-end tests: real Chromium with the built extension loaded, run
// against the local fixture pages in tests/fixtures.
//
// Run with `npm run test:e2e` (it builds the `e2e` variant first).
export default defineConfig({
  metadata: source,
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  // Every test launches its own browser with a fresh profile, so tests are
  // independent and can run in parallel.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'vite --config tests/fixtures/vite.config.ts',
    url: `http://127.0.0.1:${FIXTURE_PORT}/`,
    reuseExistingServer: false,
  },
});
