import {defineConfig, devices} from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {name: 'chromium-desktop', use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900}}},
    {name: 'webkit-mobile', use: {...devices['iPhone 13'], browserName: 'webkit', viewport: {width: 390, height: 844}}},
  ],
  webServer: {
    command: 'pnpm --dir apps/web dev',
    url: 'http://127.0.0.1:3000/en',
    reuseExistingServer: !process.env.CI,
  },
})
