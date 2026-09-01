import {defineConfig, devices} from '@playwright/test'

const port = 3100
const validationSecret = 'local_validation_secret_32_chars__'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/navigation-performance.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {name: 'chromium-production', use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900}}},
  ],
  webServer: {
    command: `WEB_API_RATE_LIMIT_SIGNING_SECRET=${validationSecret} AIFANS_NEXT_DIST_DIR=.next-production-e2e pnpm -C apps/web exec next start --port ${port}`,
    url: `http://127.0.0.1:${port}/en`,
    reuseExistingServer: false,
  },
})
