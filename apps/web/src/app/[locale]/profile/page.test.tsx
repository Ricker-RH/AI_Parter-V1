import {render, screen} from '@testing-library/react'
import type {Account} from '@aifans/contracts'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {CurrentAccountProvider} from '../../../components/account/CurrentAccountProvider.js'

const {access, connection} = vi.hoisted(() => ({access: vi.fn(), connection: vi.fn()}))
vi.mock('../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access}))
vi.mock('next/server', () => ({connection}))

import * as profileRoute from './page.js'

const ProfilePage = profileRoute.default
const account: Account = {
  id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30', kind: 'human', username: 'rui', displayName: 'Rui', bio: null,
  avatarUrl: null, preferredLocale: 'en', creatorModeEnabled: false, profileVersion: 1, background: {type: 'color', colorKey: 'paper'},
}

describe('my profile page', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    connection.mockReset().mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(account)))
  })

  it('keeps private profile access non-instant and waits for a request before auth', async () => {
    await ProfilePage({params: Promise.resolve({locale: 'en'})})

    expect(profileRoute.instant).toBe(false)
    expect(connection).toHaveBeenCalledOnce()
    expect(connection.mock.invocationCallOrder[0]).toBeLessThan(access.mock.invocationCallOrder[0] ?? Infinity)
  })

  it('uses the shared contextual profile header without a bulky visible page header', async () => {
    const page = await ProfilePage({params: Promise.resolve({locale: 'en'})})
    const {container} = render(<CurrentAccountProvider initialAccount={account}>{page}</CurrentAccountProvider>)

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
