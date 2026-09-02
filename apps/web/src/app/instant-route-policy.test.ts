import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const nonInstantLocalePages = [
  './[locale]/activity/page.tsx',
  './[locale]/admin/page.tsx',
  './[locale]/admin/creator/page.tsx',
  './[locale]/auth/[view]/page.tsx',
  './[locale]/bookmarks/page.tsx',
  './[locale]/creator/page.tsx',
  './[locale]/creator/[draftId]/page.tsx',
  './[locale]/liked/page.tsx',
  './[locale]/messages/page.tsx',
  './[locale]/messages/[conversationId]/page.tsx',
  './[locale]/notifications/page.tsx',
  './[locale]/posts/[postId]/page.tsx',
  './[locale]/profile/page.tsx',
  './[locale]/profiles/[profileId]/page.tsx',
  './[locale]/search/page.tsx',
  './[locale]/settings/page.tsx',
] as const

describe('instant route policy', () => {
  it.each(nonInstantLocalePages)('keeps the unmigrated route %s explicitly non-instant', (relativePath) => {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
    expect(source).toMatch(/export const instant = false/)
  })
})
