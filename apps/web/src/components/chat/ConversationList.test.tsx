import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {afterEach, expect, describe, it, vi} from 'vitest'
import {encodeChatConversationCursor} from '@aifans/contracts'
import {StrictMode} from 'react'
import {ConversationList} from './ConversationList.js'

vi.mock('next/navigation', () => ({useRouter: () => ({refresh: vi.fn()})}))

const labels = {title: 'Messages', chatTab: 'Chats', notificationsTab: 'Notifications', noConversations: 'No conversations yet', emptyDescription: 'Conversations with AI/IP profiles appear here.', emptyAction: 'Explore home', searchLabel: 'Search conversations', searchPlaceholder: 'Search', noSearchResults: 'No matching conversations', partialSearchResults: 'No matches in loaded conversations. Load more to keep searching.', loadMore: 'Load more', loadingMore: 'Loading…', loadMoreError: 'Could not load more conversations.', unavailable: 'Messages are unavailable right now.', unavailableDescription: 'We could not load your conversations.', unavailableAction: 'Try again', unavailablePending: 'Trying again…'}
const item = {id: '11111111-1111-4111-8111-111111111111', ipProfile: {id: '22222222-2222-4222-8222-222222222222', displayName: 'Luma', username: 'luma'}, lastMessage: {body: 'Last real message', role: 'assistant' as const, createdAt: '2026-09-01T00:00:00.000Z'}, updatedAt: '2026-09-01T00:00:00.000Z', sendEnabled: true}
const originCursor = encodeChatConversationCursor({v: 1, kind: 'chat-conversations', updatedAt: '2026-09-01T01:00:00.000Z', id: item.id})
const nextCursor = encodeChatConversationCursor({v: 1, kind: 'chat-conversations', updatedAt: '2026-09-01T00:00:00.000Z', id: item.id})

afterEach(() => vi.unstubAllGlobals())

describe('ConversationList', () => {
  it('renders real identity and last-message summary with selected state', () => {
    render(<ConversationList initialCursor={originCursor} items={[item]} labels={labels} locale="en" selectedId={item.id}/>)
    const link = screen.getByRole('link', {name: /Luma/})
    expect(link).toHaveAttribute('href', `/en/messages/${item.id}?listCursor=${encodeURIComponent(originCursor)}`)
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByText('@luma')).toBeNull()
    expect(screen.getByText('Last real message')).toBeVisible()
    expect(screen.queryByText('Sep 1')).toBeNull()
  })

  it('shows the persisted IP unread count in the same round badge as human chats', () => {
    render(<ConversationList items={[{...item, unreadCount: 2}]} labels={labels} locale="en"/>)
    expect(screen.getByLabelText('2 unread messages')).toHaveTextContent('2')
  })

  it('opens a conversation from its copy while its avatar opens the IP profile', () => {
    render(<ConversationList items={[item]} labels={labels} locale="en"/>)

    expect(screen.getByRole('link', {name: 'View profile'})).toHaveAttribute('href', '/en/profiles/22222222-2222-4222-8222-222222222222')
    expect(screen.getByRole('link', {name: /Open conversation: Luma/})).toHaveAttribute('href', `/en/messages/${item.id}`)
  })

  it('uses honest empty and pagination states', () => {
    const {rerender} = render(<ConversationList items={[]} labels={labels} locale="en"/>)
    expect(screen.getByRole('heading', {name: 'No conversations yet'})).toBeVisible()
    expect(screen.getByText('Conversations with AI/IP profiles appear here.')).toBeVisible()
    expect(screen.getByRole('link', {name: 'Explore home'})).toHaveAttribute('href', '/en')
    rerender(<ConversationList items={[item]} labels={labels} locale="en" nextCursor={nextCursor}/>)
    expect(screen.getByRole('button', {name: 'Load more'})).toBeEnabled()
  })

  it('does not show a conversation until it has a real message', () => {
    render(<ConversationList items={[{...item, lastMessage: null}]} labels={labels} locale="en"/>)

    expect(screen.queryByRole('link', {name: /Luma/})).toBeNull()
    expect(screen.getByRole('heading', {name: 'No conversations yet'})).toBeVisible()
  })

  it('filters empty conversations returned by later pages', async () => {
    const emptyConversation = {...item, id: '33333333-3333-4333-8333-333333333333', ipProfile: {...item.ipProfile, displayName: 'Empty'}, lastMessage: null}
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({items: [emptyConversation], nextCursor: null})))
    render(<ConversationList items={[item]} labels={labels} locale="en" nextCursor={nextCursor}/>)

    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))

    await waitFor(() => expect(screen.queryByRole('button', {name: 'Load more'})).toBeNull())
    expect(screen.queryByRole('link', {name: /Empty/})).toBeNull()
    expect(screen.getByText('Last real message')).toBeVisible()
  })

  it('keeps search active while it accumulates and de-duplicates the next cursor page', async () => {
    const second = {...item, id: '33333333-3333-4333-8333-333333333333', ipProfile: {...item.ipProfile, displayName: 'Orion', username: 'night_sky'}, lastMessage: {...item.lastMessage, body: 'A quiet constellation'}}
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({items: [item, second], nextCursor: null})))
    render(<ConversationList items={[item]} labels={labels} locale="en" nextCursor={nextCursor}/>)
    const search = screen.getByRole('searchbox', {name: 'Search conversations'})
    fireEvent.change(search, {target: {value: 'NIGHT'}})
    expect(screen.getByText('No matches in loaded conversations. Load more to keep searching.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))
    expect(await screen.findByRole('link', {name: /Orion/})).toHaveAttribute(
      'href',
      `/en/messages/${second.id}?listCursor=${encodeURIComponent(nextCursor)}`,
    )
    expect(fetch).toHaveBeenCalledWith(`/api/conversations?cursor=${encodeURIComponent(nextCursor)}`, expect.objectContaining({method: 'GET'}))
    expect(screen.queryAllByRole('link', {name: /Luma/})).toHaveLength(0)
    fireEvent.change(search, {target: {value: 'missing'}})
    expect(await screen.findByText('No matching conversations')).toBeVisible()
    expect(screen.queryByText('No conversations yet')).toBeNull()
  })

  it('keeps pagination mounted through Strict Effects setup-cleanup-setup', async () => {
    const second = {...item, id: '33333333-3333-4333-8333-333333333333', ipProfile: {...item.ipProfile, displayName: 'Orion'}}
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({items: [second], nextCursor: null})))
    render(<StrictMode><ConversationList items={[item]} labels={labels} locale="en" nextCursor={nextCursor}/></StrictMode>)
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))
    expect(await screen.findByRole('link', {name: /Orion/})).toBeVisible()
  })

  it('aborts and ignores a stale pagination request when the list cursor changes', async () => {
    let resolve!: (response: Response) => void
    const stale = {...item, id: '44444444-4444-4444-8444-444444444444', ipProfile: {...item.ipProfile, displayName: 'Stale'}}
    const current = {...item, id: '55555555-5555-4555-8555-555555555555', ipProfile: {...item.ipProfile, displayName: 'Current'}}
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    const {rerender} = render(<ConversationList initialCursor={originCursor} items={[item]} labels={labels} locale="en" nextCursor={nextCursor}/>)
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))
    const signal = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].signal as AbortSignal
    rerender(<ConversationList items={[current]} labels={labels} locale="en" nextCursor={null}/>)
    expect(signal.aborted).toBe(true)
    resolve(Response.json({items: [stale], nextCursor: null}))
    await waitFor(() => expect(screen.getByRole('link', {name: /Current/})).toBeVisible())
    expect(screen.queryByRole('link', {name: /Stale/})).toBeNull()
  })

  it('does not let a stale request unlock a newer pagination request', async () => {
    const resolvers: Array<(response: Response) => void> = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolvers.push(resolve) })))
    const {rerender} = render(<ConversationList initialCursor={originCursor} items={[item]} labels={labels} locale="en" nextCursor={nextCursor}/>)
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))
    rerender(<ConversationList items={[item]} labels={labels} locale="en" nextCursor={originCursor}/>)
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))
    const cancel = vi.fn().mockResolvedValue(undefined)
    resolvers[0]!({body: {cancel}} as unknown as Response)
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce())
    const active = screen.getByRole('button', {name: 'Loading…'})
    expect(active).toBeDisabled()
    fireEvent.click(active)
    expect(fetch).toHaveBeenCalledTimes(2)
    resolvers[1]!(Response.json({items: [], nextCursor: null}))
  })

  it('returns a selected desktop detail to sign-in with its conversation-list cursor on 401', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', {assign})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 401})))
    render(<ConversationList initialCursor={originCursor} items={[item]} labels={labels} locale="en" nextCursor={nextCursor} selectedId={item.id}/>)

    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))

    await waitFor(() => expect(assign).toHaveBeenCalledWith(`/en/auth/sign-in?next=${encodeURIComponent(`/en/messages/${item.id}?listCursor=${originCursor}`)}`))
  })

  it('ignores a pagination body that finishes parsing after the list was reset', async () => {
    let resolveJson!: (value: unknown) => void
    const stale = {...item, id: '44444444-4444-4444-8444-444444444444', ipProfile: {...item.ipProfile, displayName: 'Stale after JSON'}}
    const current = {...item, id: '55555555-5555-4555-8555-555555555555', ipProfile: {...item.ipProfile, displayName: 'Current after reset'}}
    const json = vi.fn().mockReturnValue(new Promise<unknown>((resolve) => { resolveJson = resolve }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({status: 200, ok: true, body: null, json} as unknown as Response))
    const {rerender} = render(<ConversationList initialCursor={originCursor} items={[item]} labels={labels} locale="en" nextCursor={nextCursor}/>)
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))
    await waitFor(() => expect(json).toHaveBeenCalledOnce())

    rerender(<ConversationList items={[current]} labels={labels} locale="en" nextCursor={null}/>)
    resolveJson({items: [stale], nextCursor: null})

    await waitFor(() => expect(screen.getByRole('link', {name: /Current after reset/})).toBeVisible())
    expect(screen.queryByRole('link', {name: /Stale after JSON/})).toBeNull()
  })

  it('ignores a pagination body parse failure after the list was reset', async () => {
    let rejectJson!: (reason: Error) => void
    const current = {...item, id: '55555555-5555-4555-8555-555555555555', ipProfile: {...item.ipProfile, displayName: 'Current after rejected JSON'}}
    const json = vi.fn().mockReturnValue(new Promise<unknown>((_resolve, reject) => { rejectJson = reject }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({status: 200, ok: true, body: null, json} as unknown as Response))
    const {rerender} = render(<ConversationList initialCursor={originCursor} items={[item]} labels={labels} locale="en" nextCursor={nextCursor}/>)
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))
    await waitFor(() => expect(json).toHaveBeenCalledOnce())

    rerender(<ConversationList items={[current]} labels={labels} locale="en" nextCursor={null}/>)
    rejectJson(new Error('stale body parse failure'))

    await waitFor(() => expect(screen.getByRole('link', {name: /Current after rejected JSON/})).toBeVisible())
    expect(screen.queryByText(labels.loadMoreError)).toBeNull()
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
    const source = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/chat/ConversationList.tsx' : 'apps/web/src/components/chat/ConversationList.tsx', 'utf8')
    const baseRules = stylesheet.slice(0, stylesheet.indexOf('@media (max-width: 699px)'))
    const mobileRules = stylesheet.slice(stylesheet.indexOf('@media (max-width: 699px)'), stylesheet.indexOf('@media (min-width: 700px)'))
    expect(stylesheet).toMatch(/\.conversationTitle strong \{[^}]*overflow-wrap: anywhere/)
    expect(stylesheet).toMatch(/\.listPane \{[^}]*display: flex[^}]*flex-direction: column/)
    expect(baseRules).toMatch(/\.sectionTabs \{[^}]*gap: 4px/)
    expect(baseRules).toMatch(/\.titleRow h1 \{[^}]*font-size: 19px/)
    expect(source).toContain('<SectionSearchField')
    expect(baseRules).toMatch(/\.sectionTabs a \{[^}]*background: transparent[^}]*border: 0[^}]*font-size: 13px[^}]*font-weight: 500[^}]*isolation: isolate[^}]*min-height: 44px[^}]*padding: 0 12px[^}]*position: relative/)
    expect(baseRules).toMatch(/\.sectionTabs a::before \{[^}]*border: 1px solid var\(--shell-border\)[^}]*border-radius: 999px[^}]*inset: 7px 0/)
    expect(baseRules).toMatch(/\.sectionTabs a:hover::before \{[^}]*background: var\(--shell-hover\)/)
    expect(baseRules).toMatch(/\.sectionTabs a\[aria-current="page"\] \{[^}]*background: transparent[^}]*border: 0[^}]*font-weight: 650/)
    expect(baseRules).toMatch(/\.sectionTabs a\[aria-current="page"\]::before \{[^}]*background: var\(--shell-hover\)[^}]*border-color: var\(--shell-muted\)/)
    expect(mobileRules).not.toMatch(/\.sectionTabs/)
    expect(stylesheet).not.toMatch(/\.sectionTabs a\[aria-current="page"\] \{[^}]*background: var\(--shell-text\)/)
    expect(stylesheet).not.toMatch(/100dvh/)
    expect(stylesheet).toMatch(/\.workspace, \.detailPane \{ min-height: 0; \}/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*:global\(\.messages-shell\[data-mobile-top-bar="hidden"\] \.mobile-top-bar\) \{ display: none; \}/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*\.listPane \{[\s\S]*padding-bottom: calc\(50px \+ env\(safe-area-inset-bottom\)\)/)
    const shellStylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')
    expect(shellStylesheet).toMatch(/\.messages-shell \{ display: grid; grid-template-rows: minmax\(0, 1fr\); height: var\(--app-viewport-height\); min-height: 0; overflow: hidden; \}/)
    expect(shellStylesheet).toMatch(/\.messages-shell \.content \{ display: grid; grid-template-rows: auto minmax\(0, 1fr\); min-height: 0; \}/)
  })

  it('keeps the section tabs keyboard reachable and identifies Chat as the current page', () => {
    render(<ConversationList items={[item]} labels={labels} locale="en"/>)
    const chat = screen.getByRole('link', {name: 'Chats'})
    const notifications = screen.getByRole('link', {name: 'Notifications'})

    chat.focus()
    expect(chat).toHaveFocus()
    expect(chat).toHaveAttribute('aria-current', 'page')
    expect(notifications).not.toHaveAttribute('aria-current')
  })
})
