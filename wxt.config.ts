import { defineConfig } from 'wxt';

// Fixture pages used by the end-to-end tests are served from these origins.
// They are only granted in the `e2e` build (`npm run build:e2e`), never in the real one.
const E2E_HOSTS = ['http://localhost/*', 'http://127.0.0.1/*'];

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // Keep the legacy review page addressable for regression tests, but the
      // toolbar always opens the new in-context sidebar.
      if (manifest.action) delete manifest.action.default_popup;
    },
  },
  manifest: ({ mode }) => ({
    name: 'Job Apply Assistant',
    description:
      'Fills job application forms from your saved profile. You review and submit.',
    // Native messaging must be available when the MV3 worker starts. Optional
    // runtime grants can leave Chrome's native API absent until an extension reload.
    permissions: ['storage', 'activeTab', 'scripting', 'sidePanel', 'nativeMessaging'],
    side_panel: { default_path: 'sidepanel.html' },
    options_ui: { page: 'home.html', open_in_tab: true },
    host_permissions: mode === 'e2e' ? E2E_HOSTS : [],
    commands: {
      autofill: {
        suggested_key: { default: 'Alt+Shift+F' },
        description: 'Open the application sidebar',
      },
    },
  }),
});
