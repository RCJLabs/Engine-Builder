import { defineConfig, devices } from '@playwright/test';

// The built editor, served the way Pages serves it: at the root of its own domain (D28).
const BASE_URL = 'http://localhost:4173/';

export default defineConfig({
  testDir: 'apps/editor/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // No retries: a flaky check that quietly passes on the second try is a check that hides bugs.
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The specs written before M5.7 hold the view to what was authored, every plant and drop and
    // the physical sky, so they draw at High; Auto would pick Low for the software renderer here.
    // perf.spec.ts and perfPhone.spec.ts set their own (D69).
    storageState: {
      cookies: [],
      origins: [{ origin: BASE_URL.replace(/\/$/, ''), localStorage: [{ name: 'eb-quality', value: 'high' }] }],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @eb/editor preview',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
