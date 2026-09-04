import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import en from '../../../../../messages/en.json'
import zhCN from '../../../../../messages/zh-CN.json'

const {access, connection, notFound, editor} = vi.hoisted(() => ({
  access: vi.fn(),
  connection: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  editor: vi.fn(({returnTo}: {returnTo: string}) => <div data-testid="editor">{returnTo}</div>),
}))

vi.mock('../../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access}))
vi.mock('next/server', () => ({connection}))
vi.mock('next/navigation', () => ({notFound}))
vi.mock('../../../../components/profile/ProfileEditor.js', () => ({ProfileEditor: editor}))

import * as editRoute from './page.js'

const EditProfilePage = editRoute.default

describe('profile edit route', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    connection.mockReset().mockResolvedValue(undefined)
    notFound.mockClear()
    editor.mockClear()
  })

  it('is request-bound and authenticates against the exact edit URL', async () => {
    render(await EditProfilePage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({returnTo: '/en/profile?tab=saved#item'})}))

    expect(editRoute.instant).toBe(false)
    expect(connection).toHaveBeenCalledOnce()
    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/profile/edit?returnTo=%2Fen%2Fprofile%3Ftab%3Dsaved%23item'})
    expect(screen.getByTestId('editor')).toHaveTextContent('/en/profile?tab=saved#item')
  })

  it.each([
    ['external URL', 'https://evil.example/en/profile'],
    ['protocol-relative URL', '//evil.example/en/profile'],
    ['another locale', '/zh-CN/profile'],
    ['duplicate value', ['/en/profile', '/en/search']],
  ])('rejects an unsafe %s return target', async (_label, returnTo) => {
    render(await EditProfilePage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({returnTo})}))

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/profile/edit'})
    expect(screen.getByTestId('editor')).toHaveTextContent('/en/profile')
  })

  it('uses the same standalone shell for an authentication outage', async () => {
    access.mockResolvedValue({status: 'unavailable'})
    const {container} = render(await EditProfilePage({params: Promise.resolve({locale: 'zh-CN'}), searchParams: Promise.resolve({})}))

    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('无法加载你的个人资料')
  })

  it('rejects an invalid locale before authentication', async () => {
    await expect(EditProfilePage({params: Promise.resolve({locale: 'fr'}), searchParams: Promise.resolve({})})).rejects.toThrow('NEXT_NOT_FOUND')
    expect(access).not.toHaveBeenCalled()
  })

  it('provides complete localized editor labels in English and Chinese', () => {
    expect(en.profileEditor.title).toBe('Edit profile')
    expect(zhCN.profileEditor.title).toBe('编辑个人资料')
    expect(Object.keys(zhCN.profileEditor)).toEqual(Object.keys(en.profileEditor))
  })
})
