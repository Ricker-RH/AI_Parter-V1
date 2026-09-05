import {defineConfig,devices} from '@playwright/test'
import base from './playwright.config'

// Firefox provides an extra layout-engine check, not an Android-device emulator.
export default defineConfig({
  ...base,
  testMatch:['**/mobile-shell-geometry.spec.ts','**/standalone-safe-area.spec.ts'],
  projects:[
    {name:'chromium-mobile',use:{...devices['Pixel 7']}},
    {name:'webkit-mobile',use:{...devices['iPhone 13']}},
    {name:'firefox-mobile-layout',use:{browserName:'firefox',viewport:{width:390,height:844}}},
  ],
})
