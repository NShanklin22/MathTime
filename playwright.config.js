import { defineConfig } from '@playwright/test';

// The two sizes every measurement in spec §6 was verified at.
//
// The phone is a real 2x browser window, not emulation: an emulated
// deviceScaleFactor snaps paint to whole CSS px, which real 2x screens do not.
// --disable-lcd-text keeps ClearType colour fringes out of pixel measurements.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5481', browserName: 'chromium' },
  webServer: {
    command: 'node scripts/serve.mjs',
    env: { PORT: '5481' },
    port: 5481,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'phone',
      use: {
        viewport: null,
        launchOptions: { args: ['--force-device-scale-factor=2', '--window-size=375,812', '--disable-lcd-text'] },
      },
    },
    {
      name: 'desktop',
      use: {
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        launchOptions: { args: ['--disable-lcd-text'] },
      },
    },
  ],
});
