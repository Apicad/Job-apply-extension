import { defineConfig } from 'wxt';
import { EMBED_HOST_PERMISSIONS } from './lib/ats';

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
    // A toolbar click covers the page in the tab. These hosts are for application forms that
    // companies show inside their own pages, in a frame from another origin (see lib/ats.ts).
    host_permissions: mode === 'e2e' ? [...EMBED_HOST_PERMISSIONS, ...E2E_HOSTS] : [...EMBED_HOST_PERMISSIONS],
    commands: {
      autofill: {
        suggested_key: { default: 'Alt+Shift+F' },
        description: 'Fill the application form on this page',
      },
    },
  }),
});
