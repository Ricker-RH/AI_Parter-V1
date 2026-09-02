import {fireEvent, render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {expect, describe, it, vi} from 'vitest'
import {ConversationList} from './ConversationList.js'

vi.mock('next/navigation', () => ({useRouter: () => ({refresh: vi.fn()})}))

const labels = {title: 'Messages', chatTab: 'Chats', notificationsTab: 'Notifications', noConversations: 'No conversations yet', emptyDescription: 'Conversations with AI/IP profiles appear here.', emptyAction: 'Explore home', searchLabel: 'Search conversations', searchPlaceholder: 'Search', noSearchResults: 'No matching conversations', loadMore: 'Load more', unavailable: 'Messages are unavailable right now.', unavailableDescription: 'We could not load your conversations.', unavailableAction: 'Try again', unavailablePending: 'Trying again…'}
const item = {id: '11111111-1111-4111-8111-111111111111', ipProfile: {id: '22222222-2222-4222-8222-222222222222', displayName: 'Luma', username: 'luma'}, lastMessage: {body: 'Last real message', role: 'assistant' as const, createdAt: '2026-09-01T00:00:00.000Z'}, updatedAt: '2026-09-01T00:00:00.000Z', sendEnabled: true}

describe('ConversationList', () => {
  it('renders real identity and last-message summary with selected state', () => {
    render(<ConversationList items={[item]} labels={labels} locale="en" selectedId={item.id}/>)
    const link = screen.getByRole('link', {name: /Luma/})
    expect(link).toHaveAttribute('href', `/en/messages/${item.id}`)
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('@luma')).toBeVisible()
    expect(screen.getByText('Last real message')).toBeVisible()
  })

  it('uses honest empty and pagination states', () => {
    const {rerender} = render(<ConversationList items={[]} labels={labels} locale="en"/>)
    expect(screen.getByRole('heading', {name: 'No conversations yet'})).toBeVisible()
    expect(screen.getByText('Conversations with AI/IP profiles appear here.')).toBeVisible()
    expect(screen.getByRole('link', {name: 'Explore home'})).toHaveAttribute('href', '/en')
    rerender(<ConversationList items={[item]} labels={labels} locale="en" moreHref="/en/messages?cursor=next"/>)
    expect(screen.getByRole('link', {name: 'Load more'})).toHaveAttribute('href', '/en/messages?cursor=next')
  })

  it('filters loaded conversation summaries without changing pagination links', () => {
    const second = {...item, id: '33333333-3333-4333-8333-333333333333', ipProfile: {...item.ipProfile, displayName: 'Orion', username: 'night_sky'}, lastMessage: {...item.lastMessage, body: 'A quiet constellation'}}
    render(<ConversationList items={[item, second]} labels={labels} locale="en" moreHref="/en/messages?cursor=next"/>)
    const search = screen.getByRole('searchbox', {name: 'Search conversations'})
    fireEvent.change(search, {target: {value: 'NIGHT'}})
    expect(screen.queryByRole('link', {name: /Luma/})).toBeNull()
    expect(screen.getByRole('link', {name: /Orion/})).toBeVisible()
    expect(screen.getByRole('link', {name: 'Load more'})).toHaveAttribute('href', '/en/messages?cursor=next')
    fireEvent.change(search, {target: {value: 'missing'}})
    expect(screen.getByText('No matching conversations')).toBeVisible()
    expect(screen.queryByText('No conversations yet')).toBeNull()
  })

  it('renders an exclusive unavailable state without an active search or empty-inbox copy', () => {
    render(<ConversationList items={[]} labels={labels} locale="en" unavailable/>)
    expect(screen.getByRole('alert')).toHaveTextContent('Messages are unavailable right now.')
    expect(screen.getByText('We could not load your conversations.')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Try again'})).toBeEnabled()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByText('No conversations yet')).toBeNull()
    expect(screen.queryByText('No matching conversations')).toBeNull()
  })

  it('keeps unbroken display names within the conversation pane', () => {
    const stylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/chat/MessagesWorkspace.module.css' : 'apps/web/src/components/chat/MessagesWorkspace.module.css', 'utf8')
    expect(stylesheet).toMatch(/\.conversationTitle strong \{[^}]*overflow-wrap: anywhere/)
    expect(stylesheet).toMatch(/\.listPane \{[^}]*display: flex[^}]*flex-direction: column/)
    expect(stylesheet).toMatch(/\.sectionTabs a\[aria-current="page"\] \{[^}]*background: var\(--shell-hover\)[^}]*border-color: var\(--shell-muted\)[^}]*color: var\(--shell-text\)/)
    expect(stylesheet).not.toMatch(/\.sectionTabs a\[aria-current="page"\] \{[^}]*background: var\(--shell-text\)/)
    expect(stylesheet).not.toMatch(/100dvh/)
    expect(stylesheet).toMatch(/\.workspace, \.detailPane \{ min-height: 0; \}/)
    const shellStylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')
    expect(shellStylesheet).toMatch(/\.messages-shell \{ display: grid; grid-template-rows: minmax\(0, 1fr\); height: 100dvh; min-height: 0; overflow: hidden; \}/)
    expect(shellStylesheet).toMatch(/\.messages-shell \.content \{ display: grid; grid-template-rows: auto minmax\(0, 1fr\); min-height: 0; \}/)
  })
})
