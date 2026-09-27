import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
export default defineConfig({
  testDir: 'tests/browser',
  // Every fresh page now downloads the complete media library before play.
  timeout: 90000,
  expect: { timeout: 15000 },
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    env: {
      PORT: '5174',
      READING_MODE: 'local',
      LOCAL_NETWORK_QUOTA: 'off',
      LOCAL_STATE_FILE: `.private/browser-tests/${randomUUID()}.json`,
    },
    timeout: 30000,
  },
});
