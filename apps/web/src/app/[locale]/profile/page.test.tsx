import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access} = vi.hoisted(() => ({access: vi.fn()}))
vi.mock('../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access}))

import ProfilePage from './page.js'

describe('my profile page', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
      kind: 'human',
      username: 'rui',
      displayName: 'Rui',
      bio: null,
      preferredLocale: 'en',
      creatorModeEnabled: false,
    })))
  })

  it('uses the shared contextual profile header without a bulky visible page header', async () => {
    const {container} = render(await ProfilePage({params: Promise.resolve({locale: 'en'})}))

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/profile'})
    expect(container.querySelector('.page-header')).toBeNull()
    expect(await screen.findByRole('heading', {level: 1, name: '@rui'})).toBeVisible()
  })

  it('keeps the same page shell for the honest unavailable state', async () => {
    access.mockResolvedValue({status: 'unavailable'})
    const {container} = render(await ProfilePage({params: Promise.resolve({locale: 'en'})}))

    expect(container.querySelector('.page-header')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load your profile')
  })
})
