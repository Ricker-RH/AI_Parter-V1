import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {ChatPanel, type ChatLabels} from './ChatPanel.js'

const analyticsCapture = vi.fn()
vi.mock('../../lib/analytics/provider.js', () => ({useAnalytics: () => ({capture: analyticsCapture, identify: vi.fn(), page: vi.fn(), reset: vi.fn()})}))

const ipProfileId = '11111111-1111-4111-8111-111111111111'
const conversationId = '22222222-2222-4222-8222-222222222222'
const secondConversationId = '44444444-4444-4444-8444-444444444444'
const labels: ChatLabels = {
  title: 'Messages', eyebrow: 'AI/IP chat', description: 'Choose a public AI/IP ID to begin.', targetLabel: 'AI/IP public ID', targetHint: 'Enter the UUID of a public AI/IP profile.', targetRequired: 'Enter a valid AI/IP public ID before sending.', conversationLabel: 'Conversation ID', sessionNotice: 'This conversation is kept only on this page and may be empty after refresh.', emptyTitle: 'Start a conversation', emptyDescription: 'Choose an AI/IP and send a message.', messageLabel: 'Message', messagePlaceholder: 'Write a message…', send: 'Send', sending: 'Sending…', waiting: 'Waiting for a response…', you: 'You', ai: 'AI/IP', newConversation: 'New conversation', authRequired: 'Sign in to chat.', chatNotConfigured: 'Chat is not configured.', providerUnavailable: 'The chat provider is unavailable.', requestFailed: 'The message could not be sent.', invalidResponse: 'The chat service returned an invalid response.',
}

const response = {answer: 'Hello back', conversationId, messageId: '33333333-3333-4333-8333-333333333333', createdAt: '2026-09-01T01:00:00.000Z'}

afterEach(() => {
  vi.unstubAllGlobals()
  analyticsCapture.mockClear()
})

function selectTarget() {
  fireEvent.change(screen.getByLabelText('AI/IP public ID'), {target: {value: ipProfileId}})
}

describe('ChatPanel', () => {
  it('requires a real target and starts without invented messages', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    render(<ChatPanel labels={labels} locale="en" />)
    expect(screen.getByRole('heading', {name: 'Start a conversation'})).toBeVisible()
    expect(screen.queryByRole('listitem')).toBeNull()
    fireEvent.change(screen.getByLabelText('AI/IP public ID'), {target: {value: 'not-a-uuid'}})
    fireEvent.change(screen.getByLabelText('Message'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid AI/IP public ID before sending.')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('captures chat-open intent after target validation without copying the message body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(response, {status: 201})))
    render(<ChatPanel labels={labels} locale="en" />)
    selectTarget()
    fireEvent.change(screen.getByLabelText('Message'), {target: {value: 'This private message must not be tracked'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await waitFor(() => expect(analyticsCapture).toHaveBeenCalledTimes(1))
    expect(analyticsCapture).toHaveBeenCalledWith({name: 'chat_opened', properties: {event_version: 1, ip_profile_id: ipProfileId, locale: 'en'}})
    expect(JSON.stringify(analyticsCapture.mock.calls)).not.toContain('This private message must not be tracked')
  })

  it('captures chat opening once per target and again only after starting a new conversation', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(response, {status: 201}))
      .mockResolvedValueOnce(Response.json({...response, answer: 'Second reply'}, {status: 200}))
      .mockResolvedValueOnce(Response.json({...response, conversationId: secondConversationId}, {status: 201}))
    vi.stubGlobal('fetch', fetcher)
    render(<ChatPanel labels={labels} locale="en" />)
    selectTarget()
    fireEvent.change(screen.getByLabelText('Message'), {target: {value: 'First'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await screen.findByText('Hello back')
    fireEvent.change(screen.getByLabelText('Message'), {target: {value: 'Continue'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await screen.findByText('Second reply')
    expect(analyticsCapture).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', {name: 'New conversation'}))
    selectTarget()
    fireEvent.change(screen.getByLabelText('Message'), {target: {value: 'New session'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await waitFor(() => expect(analyticsCapture).toHaveBeenCalledTimes(2))
  })

  it('renders a real answer and reuses its conversation ID for continuation', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(response, {status: 201}))
      .mockResolvedValueOnce(Response.json({...response, answer: 'Second answer', conversationId: secondConversationId}, {status: 200}))
    vi.stubGlobal('fetch', fetcher)
    render(<ChatPanel labels={labels} locale="zh-CN" />)
    selectTarget()
    fireEvent.change(screen.getByLabelText('Message'), {target: {value: ' First question '}})
    fireEvent.submit(screen.getByLabelText('Message').closest('form')!)
    expect(await screen.findByText('Hello back')).toBeVisible()
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({message: 'First question', locale: 'zh-CN'})
    expect(screen.getByText(conversationId)).toBeVisible()
    expect(screen.getByLabelText('AI/IP public ID')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Message'), {target: {value: 'Second question'}})
    fireEvent.keyDown(screen.getByLabelText('Message'), {key: 'Enter', shiftKey: false})
    expect(await screen.findByText('Second answer')).toBeVisible()
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({message: 'Second question', conversationId, locale: 'zh-CN'})
    expect(screen.getAllByText('You')).toHaveLength(2)
    expect(screen.getAllByText('AI/IP')).toHaveLength(2)
  })

  it('uses Shift+Enter for a newline without sending', () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    render(<ChatPanel labels={labels} locale="en" />)
    selectTarget()
    const input = screen.getByLabelText('Message')
    fireEvent.change(input, {target: {value: 'Line one'}})
    fireEvent.keyDown(input, {key: 'Enter', shiftKey: true})
    expect(fetcher).not.toHaveBeenCalled()
    expect(input).toHaveValue('Line one')
  })

  it('announces pending work and can explicitly reset page-local conversation state', async () => {
    let resolve!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    render(<ChatPanel labels={labels} locale="en" />)
    selectTarget()
    fireEvent.change(screen.getByLabelText('Message'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    expect(screen.getByRole('button', {name: 'Sending…'})).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for a response…')
    resolve(Response.json(response, {status: 201}))
    await screen.findByText('Hello back')
    fireEvent.click(screen.getByRole('button', {name: 'New conversation'}))
    expect(screen.queryByText('Hello back')).toBeNull()
    expect(screen.getByLabelText('AI/IP public ID')).toBeEnabled()
    expect(screen.getByRole('heading', {name: 'Start a conversation'})).toBeVisible()
  })

  it.each([
    [401, 'Sign in to chat.'],
    [502, 'The chat provider is unavailable.'],
    [503, 'Chat is not configured.'],
    [422, 'The message could not be sent.'],
  ])('shows safe guidance for HTTP %s and no assistant reply', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({message: 'private detail'}, {status})))
    render(<ChatPanel labels={labels} locale="en" />)
    selectTarget()
    fireEvent.change(screen.getByLabelText('Message'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByText('private detail')).toBeNull()
    expect(screen.queryByText('AI/IP')).toBeNull()
  })

  it('rejects a malformed success without inventing an assistant answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({answer: 'Unsafe partial'}, {status: 201})))
    render(<ChatPanel labels={labels} locale="en" />)
    selectTarget()
    fireEvent.change(screen.getByLabelText('Message'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('The chat service returned an invalid response.')
    await waitFor(() => expect(screen.getByRole('button', {name: 'Send'})).toBeEnabled())
    expect(screen.queryByText('Unsafe partial')).toBeNull()
  })
})
