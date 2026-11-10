import { defineConfig } from 'wxt';

// Fixture pages used by the end-to-end tests are served from these origins.
// They are only granted in the `e2e` build (`npm run build:e2e`), never in the real one.
const E2E_HOSTS = ['http://localhost/*', 'http://127.0.0.1/*'];

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ mode }) => ({
    name: 'Job Apply Assistant',
    description:
      'Fills job application forms from your saved profile. You review and submit.',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: mode === 'e2e' ? E2E_HOSTS : [],
    commands: {
      autofill: {
        suggested_key: { default: 'Alt+Shift+F' },
        description: 'Open the application review popup',
      },
    },
  }),
});
