import {defineConfig, devices} from '@playwright/test'

export default defineConfig({
  testDir:'./tests/e2e',
  testMatch:'**/navigation-warmup.spec.ts',
  workers:1,
  use:{baseURL:'http://127.0.0.1:3100',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'chromium-warmup',use:{...devices['Desktop Chrome']}},
    {name:'webkit-warmup',use:{...devices['iPhone 13']}},
    {name:'firefox-warmup',use:{browserName:'firefox',viewport:{width:390,height:844}}},
  ],
})
