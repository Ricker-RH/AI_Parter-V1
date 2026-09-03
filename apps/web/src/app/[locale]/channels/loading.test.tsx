import {render} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import DirectoryLoading from './loading.js'
import DetailLoading from './[slug]/loading.js'
import ProfilesLoading from './[slug]/profiles/loading.js'

vi.mock('next/navigation', () => ({usePathname: () => '/en/channels'}))

describe('channel loading boundaries', () => {
  it.each([
    ['directory', DirectoryLoading, 'list'],
    ['detail', DetailLoading, 'feed'],
    ['profiles', ProfilesLoading, 'list'],
  ] as const)('uses a content-shaped %s skeleton', (_name, Loading, variant) => {
    const {container} = render(<Loading />)
    expect(container.querySelector(`.route-skeleton--${variant}`)).toBeTruthy()
    expect(container.querySelector('[role="status"]')).toHaveAttribute('aria-busy', 'true')
  })
})
