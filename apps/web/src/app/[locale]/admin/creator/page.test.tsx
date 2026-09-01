import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import zh from '../../../../../messages/zh-CN.json'

const access = vi.hoisted(() => vi.fn())
vi.mock('../../../../lib/operator-access.js', () => ({getOperatorPageAccess: access}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))

import CreatorAdminPage, {dynamic} from './page.js'

describe('creator operator console access', () => {
  beforeEach(() => {
    process.env.CREATOR_MODE_ENABLED = 'true'
    access.mockReset().mockResolvedValue('operator')
  })

  it('forces request-time authorization instead of prerendering the queue', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('redirects an anonymous visitor to sign in', async () => {
    access.mockResolvedValue('anonymous')

    await expect(CreatorAdminPage({params: Promise.resolve({locale: 'zh-CN'})}))
      .rejects.toThrow('REDIRECT:/zh-CN/auth/sign-in')
  })

  it('does not render the review queue for a non-operator', async () => {
    access.mockResolvedValue('forbidden')

    render(await CreatorAdminPage({params: Promise.resolve({locale: 'zh-CN'})}))

    expect(screen.getByText(zh.admin.operatorRequired)).toBeVisible()
    expect(screen.queryByText(zh.creatorAdmin.submissions)).not.toBeInTheDocument()
  })
})
