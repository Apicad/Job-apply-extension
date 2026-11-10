import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// Unit tests run in jsdom (a DOM implemented in Node). Anything that depends
// on real layout or on the extension platform is covered by the Playwright
// end-to-end tests in tests/e2e instead.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
