import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import zh from '../../../../../messages/zh-CN.json'

const {access, connection} = vi.hoisted(() => ({access: vi.fn(), connection: vi.fn()}))
vi.mock('../../../../lib/operator-access.js', () => ({getOperatorPageAccess: access}))
vi.mock('next/server', () => ({connection}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))

import * as creatorAdminRoute from './page.js'

const CreatorAdminPage = creatorAdminRoute.default

describe('creator operator console access', () => {
  beforeEach(() => {
    process.env.CREATOR_MODE_ENABLED = 'true'
    access.mockReset().mockResolvedValue('operator')
    connection.mockReset().mockResolvedValue(undefined)
  })

  it('keeps request-time authorization explicitly non-instant', () => {
    expect(creatorAdminRoute.instant).toBe(false)
  })

  it('waits for a request before reading operator access', async () => {
    await CreatorAdminPage({params: Promise.resolve({locale: 'en'})})

    expect(connection).toHaveBeenCalledOnce()
    expect(connection.mock.invocationCallOrder[0]).toBeLessThan(access.mock.invocationCallOrder[0] ?? Infinity)
  })

  it('redirects an anonymous visitor to sign in', async () => {
    access.mockResolvedValue('anonymous')

    await expect(CreatorAdminPage({params: Promise.resolve({locale: 'zh-CN'})}))
      .rejects.toThrow('REDIRECT:/zh-CN/auth/sign-in?next=%2Fzh-CN%2Fadmin%2Fcreator')
  })

  it('does not render the review queue for a non-operator', async () => {
    access.mockResolvedValue('forbidden')

    render(await CreatorAdminPage({params: Promise.resolve({locale: 'zh-CN'})}))

    expect(screen.getByText(zh.admin.operatorRequired)).toBeVisible()
    expect(screen.queryByText(zh.creatorAdmin.submissions)).not.toBeInTheDocument()
  })
})
