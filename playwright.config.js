import { defineConfig } from '@playwright/test';

// The two sizes every measurement in spec §6 was verified at.
//
// The phone is a real 2x browser window, not emulation: an emulated
// deviceScaleFactor snaps paint to whole CSS px, which real 2x screens do not.
// --disable-lcd-text keeps ClearType colour fringes out of pixel measurements.
//
// Scrollbars (incident 2026-11-05): headless Chromium starts with
// --hide-scrollbars, which hid a system scrollbar on the level selector from
// every test and screenshot. The desktop project drops that flag, so its
// pages and screenshots have real scrollbars, which take room as a desktop
// browser's do. The phone project keeps them hidden: a real phone draws
// overlay scrollbars that take no room and fade, which hidden is closer to
// than the desktop's classic ones. tests/e2e/fits.spec.js makes its own
// contexts, at the laptop sizes, from the desktop project's browser.
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
      testIgnore: 'fits.spec.js',
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
        launchOptions: { args: ['--disable-lcd-text'], ignoreDefaultArgs: ['--hide-scrollbars'] },
      },
    },
  ],
});
