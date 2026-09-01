import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import en from '../../../../messages/en.json'
import zh from '../../../../messages/zh-CN.json'

const access = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/operator-access.js', () => ({getOperatorPageAccess: access}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))

import AdminPage, {dynamic} from './page.js'

describe('localized operator console page', () => {
  beforeEach(() => access.mockReset().mockResolvedValue('operator'))

  it('forces request-time authorization instead of prerendering the console', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('keeps complete bilingual admin copy parity', () => {
    expect(Object.keys(en.admin).sort()).toEqual(Object.keys(zh.admin).sort())
    expect(en.admin.authRequired).not.toBe(zh.admin.authRequired)
    expect(en.admin.operatorRequired).not.toBe(zh.admin.operatorRequired)
    expect(en.admin.serviceUnavailable).not.toBe(zh.admin.serviceUnavailable)
  })

  it.each([
    ['en', 'Operator console', 'Authorized operators only. Actions here publish immediately to AIFANS.'],
    ['zh-CN', '运营控制台', '仅限获授权的运营人员。此处操作会立即发布到 AIFANS。'],
  ])('renders the operator-only guidance and all three forms for %s', async (locale, title, guidance) => {
    render(await AdminPage({params: Promise.resolve({locale})}))
    expect(screen.getByRole('heading', {level: 1, name: title})).toBeVisible()
    expect(screen.getByText(guidance)).toBeVisible()
    expect(screen.getAllByRole('region')).toHaveLength(3)
  })

  it('redirects an anonymous visitor to sign in without rendering the console', async () => {
    access.mockResolvedValue('anonymous')

    await expect(AdminPage({params: Promise.resolve({locale: 'zh-CN'})}))
      .rejects.toThrow('REDIRECT:/zh-CN/auth/sign-in?next=%2Fzh-CN%2Fadmin')
  })

  it('shows no operator forms to an authenticated non-operator', async () => {
    access.mockResolvedValue('forbidden')

    render(await AdminPage({params: Promise.resolve({locale: 'zh-CN'})}))

    expect(screen.getByText(zh.admin.operatorRequired)).toBeVisible()
    expect(screen.queryAllByRole('region')).toHaveLength(0)
  })
})
