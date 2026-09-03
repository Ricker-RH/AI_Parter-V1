import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access, connection} = vi.hoisted(() => ({access: vi.fn(), connection: vi.fn()}))
vi.mock('../../../../lib/operator-access.js', () => ({getOperatorPageAccess: access}))
vi.mock('next/server', () => ({connection}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {throw new Error('NOT_FOUND')}),
  redirect: vi.fn((path: string) => {throw new Error(`REDIRECT:${path}`)}),
}))

import * as route from './page.js'

describe('admin channels page', () => {
  beforeEach(() => {access.mockReset().mockResolvedValue('operator'); connection.mockReset().mockResolvedValue(undefined)})

  it('is request-scoped and renders channel management only for operators', async () => {
    expect(route.instant).toBe(false)
    render(await route.default({params: Promise.resolve({locale: 'en'})}))
    expect(connection).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', {level: 1, name: 'Channels'})).toBeVisible()
    expect(screen.getByRole('region', {name: 'Create channel'})).toBeVisible()
  })

  it('redirects anonymous visitors and hides forms from non-operators', async () => {
    access.mockResolvedValueOnce('anonymous')
    await expect(route.default({params: Promise.resolve({locale: 'zh-CN'})})).rejects.toThrow('REDIRECT:/zh-CN/auth/sign-in?next=%2Fzh-CN%2Fadmin%2Fchannels')
    access.mockResolvedValue('forbidden')
    render(await route.default({params: Promise.resolve({locale: 'en'})}))
    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.queryByRole('region', {name: 'Create channel'})).toBeNull()
  })
})
