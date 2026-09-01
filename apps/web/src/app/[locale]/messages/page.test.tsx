import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import en from '../../../../messages/en.json'
import zh from '../../../../messages/zh-CN.json'

const access = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access}))
import MessagesPage from './page.js'

describe('localized messages page', () => {
  beforeEach(() => access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'}))
  it('keeps complete bilingual chat copy parity without persistent-memory claims', () => {
    expect(Object.keys(en.chat).sort()).toEqual(Object.keys(zh.chat).sort())
    expect(en.chat.sessionNotice).toContain('only on this page')
    expect(zh.chat.sessionNotice).toContain('仅保留在当前页面')
  })

  it.each([
    ['en', 'AI/IP chat', 'Choose a public AI/IP ID to begin.'],
    ['zh-CN', 'AI/IP 对话', '输入公开 AI/IP 的 ID 后开始对话。'],
  ])('renders the real empty chat context for %s', async (locale, eyebrow, description) => {
    render(await MessagesPage({params: Promise.resolve({locale})}))
    expect(screen.getByText(eyebrow)).toBeVisible()
    expect(screen.getByText(description)).toBeVisible()
    expect(screen.getByLabelText(locale === 'en' ? 'AI/IP public ID' : 'AI/IP 公开 ID')).toBeVisible()
    expect(screen.getByRole('heading', {name: locale === 'en' ? 'Start a conversation' : '开始对话'})).toBeVisible()
  })

  it('guards the conversation UI before rendering it', async () => {
    access.mockResolvedValue({status: 'unavailable'})

    render(await MessagesPage({params: Promise.resolve({locale: 'en'})}))

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/messages'})
    expect(screen.queryByLabelText('AI/IP public ID')).toBeNull()
  })
})
