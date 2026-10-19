import { defineConfig } from '@playwright/test';

// The two sizes every measurement in spec §6 was verified at.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5481', browserName: 'chromium' },
  webServer: {
    command: 'node scripts/serve.mjs',
    env: { PORT: '5481' },
    url: 'http://127.0.0.1:5481',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  ],
});
