import {render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {expect, describe, it} from 'vitest'
import {ConversationList} from './ConversationList.js'

const labels = {title: 'Messages', noConversations: 'No conversations yet', loadMore: 'Load more'}
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
    expect(screen.getByText('No conversations yet')).toBeVisible()
    rerender(<ConversationList items={[item]} labels={labels} locale="en" moreHref="/en/messages?cursor=next"/>)
    expect(screen.getByRole('link', {name: 'Load more'})).toHaveAttribute('href', '/en/messages?cursor=next')
  })

  it('keeps unbroken display names within the conversation pane', () => {
    const stylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/chat/MessagesWorkspace.module.css' : 'apps/web/src/components/chat/MessagesWorkspace.module.css', 'utf8')
    expect(stylesheet).toMatch(/\.conversationTitle strong \{[^}]*overflow-wrap: anywhere/)
    expect(stylesheet).not.toMatch(/100dvh/)
    expect(stylesheet).toMatch(/\.workspace, \.detailPane \{ min-height: 0; \}/)
    const shellStylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')
    expect(shellStylesheet).toMatch(/\.messages-shell \{ display: grid; grid-template-rows: minmax\(0, 1fr\); height: 100dvh; min-height: 0; overflow: hidden; \}/)
    expect(shellStylesheet).toMatch(/\.messages-shell \.content \{ display: grid; grid-template-rows: auto minmax\(0, 1fr\); min-height: 0; \}/)
  })
})
