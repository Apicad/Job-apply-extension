import { defineConfig } from 'vite';

// Serves the fixture pages for the end-to-end tests.
//
// The server listens on the loopback address only. In Chromium that makes the
// same pages reachable under three different origins, which the tests use:
//   http://localhost:5179          – the "top" page origin
//   http://127.0.0.1:5179          – a second origin (cross-origin iframe the
//                                    e2e build of the extension may access)
//   http://blocked.localhost:5179  – a third origin the extension has no
//                                    permission for
export const FIXTURE_PORT = Number(process.env.JAA_FIXTURE_PORT ?? 5179);

export default defineConfig({
  root: import.meta.dirname,
  logLevel: 'warn',
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: FIXTURE_PORT,
    strictPort: true,
    // Fixture pages must look like ordinary web pages: no hot-reload client.
    hmr: false,
  },
});
