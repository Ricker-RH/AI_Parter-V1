import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {test: {name: 'root', include: ['tests/**/*.test.ts']}},
      'apps/*/vitest.config.ts',
      'packages/*/vitest.config.ts',
    ],
  },
})
