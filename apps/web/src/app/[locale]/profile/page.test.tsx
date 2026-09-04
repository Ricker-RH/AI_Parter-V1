import {describe, expect, it, vi} from 'vitest'

vi.mock('next/navigation', () => ({notFound: vi.fn()}))
import * as profileRoute from './page.js'

const ProfilePage = profileRoute.default

describe('cached profile route shell', () => {
  it('is an instant route that delegates private state to the root account cache', async () => {
    const page = await ProfilePage({params: Promise.resolve({locale: 'en'})})
    expect(profileRoute.instant).toBe(true)
    expect(page.type).toBe('main')
    expect(page.props.children.type.name).toBe('CachedProfileRoute')
  })
})
