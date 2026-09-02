import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {ChatComposer} from './ChatComposer.js'

const id = '11111111-1111-4111-8111-111111111111'
const labels = {messagePlaceholder: 'Write a message…', send: 'Send', sending: 'Sending…', messageFailed: 'Message failed', retry: 'Retry', providerUnavailable: 'The chat provider is unavailable.', invalidResponse: 'The chat service returned an invalid response.', unavailable: 'Messages are unavailable right now.'}

afterEach(() => vi.unstubAllGlobals())
describe('ChatComposer', () => {
  it('sends a strict request and progressively renders a split SSE assistant reply', async () => {
    const human = {id: '22222222-2222-4222-8222-222222222222', role: 'human', body: 'Hello', deliveryState: 'pending', createdAt: '2026-09-01T00:00:00.000Z'}
    const assistant = {id: '33333333-3333-4333-8333-333333333333', role: 'assistant', body: 'Hello there', deliveryState: 'sent', createdAt: '2026-09-01T00:00:01.000Z'}
    const sse = `data: ${JSON.stringify({type: 'human_message', message: human})}\n\ndata: ${JSON.stringify({type: 'assistant_delta', delta: 'Hello '})}\n\ndata: ${JSON.stringify({type: 'assistant_delta', delta: 'there'})}\n\ndata: ${JSON.stringify({type: 'assistant_complete', message: assistant})}\n\n`
    const bytes = new TextEncoder().encode(sse)
    vi.stubGlobal('crypto', {randomUUID: () => '44444444-4444-4444-8444-444444444444'})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({start(controller) { controller.enqueue(bytes.slice(0, 37)); controller.enqueue(bytes.slice(37)); controller.close() }}), {headers: {'content-type': 'text/event-stream'}})))
    const onMessages = vi.fn()
    render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={onMessages}/>)

    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {target: {value: 'Hello'}})
    fireEvent.keyDown(screen.getByPlaceholderText('Write a message…'), {key: 'Enter'})
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenCalledWith(`/api/conversations/${id}/messages`, expect.objectContaining({method: 'POST', body: JSON.stringify({message: 'Hello', requestId: '44444444-4444-4444-8444-444444444444', locale: 'en'})}))
    await waitFor(() => expect(onMessages).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({id: human.id, deliveryState: 'sent'}), expect.objectContaining({id: assistant.id, body: 'Hello there'})])))
  })

  it('keeps a failed human message retryable with the original request id', async () => {
    vi.stubGlobal('crypto', {randomUUID: () => '44444444-4444-4444-8444-444444444444'})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify({type: 'failed', code: 'CHAT_INTERRUPTED'})}\n\n`, {headers: {'content-type': 'text/event-stream'}})))
    render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={vi.fn()}/>)
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    expect(await screen.findByRole('button', {name: 'Retry'})).toBeVisible()
    fireEvent.click(screen.getByRole('button', {name: 'Retry'}))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const secondRequest = (fetch as ReturnType<typeof vi.fn>).mock.calls[1]![1] as RequestInit
    expect(JSON.parse(secondRequest.body as string).requestId).toBe('44444444-4444-4444-8444-444444444444')
  })

  it('honestly disables sending when the provider is unavailable', () => {
    render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={vi.fn()} sendEnabled={false}/>)
    expect(screen.getByRole('button', {name: 'Send'})).toBeDisabled()
    expect(screen.getByText('The chat provider is unavailable.')).toBeVisible()
  })

  it('keeps Shift+Enter as a newline and rejects a second send while a request is active', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => {})))
    const {unmount} = render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={vi.fn()}/>)
    const input = screen.getByPlaceholderText('Write a message…')
    fireEvent.change(input, {target: {value: 'Hello'}})
    fireEvent.keyDown(input, {key: 'Enter', shiftKey: true})
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.keyDown(input, {key: 'Enter'})
    fireEvent.click(screen.getByRole('button', {name: 'Sending…'}))
    expect(fetch).toHaveBeenCalledTimes(1)
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit
    unmount()
    expect((init.signal as AbortSignal).aborted).toBe(true)
  })

  it('removes a partial assistant on failure and retries the failed human with its original request id', async () => {
    const human = {id: '22222222-2222-4222-8222-222222222222', role: 'human', body: 'Hello', deliveryState: 'sent', createdAt: '2026-09-01T00:00:00.000Z'}
    const assistant = {id: '33333333-3333-4333-8333-333333333333', role: 'assistant', body: 'Recovered', deliveryState: 'sent', createdAt: '2026-09-01T00:00:01.000Z'}
    const first = `data: ${JSON.stringify({type: 'human_message', message: human})}\n\ndata: ${JSON.stringify({type: 'assistant_delta', delta: 'Partial'})}\n\ndata: ${JSON.stringify({type: 'failed', code: 'CHAT_INTERRUPTED'})}\n\n`
    const second = `data: ${JSON.stringify({type: 'human_message', message: human})}\n\ndata: ${JSON.stringify({type: 'assistant_complete', message: assistant})}\n\n`
    vi.stubGlobal('crypto', {randomUUID: () => '44444444-4444-4444-8444-444444444444'})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(first, {headers: {'content-type': 'text/event-stream; charset=utf-8'}})).mockResolvedValueOnce(new Response(second, {headers: {'content-type': 'text/event-stream'}})))
    const onMessages = vi.fn()
    render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={onMessages}/>)
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await screen.findByRole('button', {name: 'Retry'})
    expect(onMessages).toHaveBeenLastCalledWith([expect.objectContaining({id: human.id, deliveryState: 'failed'})])
    fireEvent.click(screen.getByRole('button', {name: 'Retry'}))
    await waitFor(() => expect(onMessages).toHaveBeenLastCalledWith([expect.objectContaining({id: human.id}), expect.objectContaining({id: assistant.id})]))
    const retry = (fetch as ReturnType<typeof vi.fn>).mock.calls[1]![1] as RequestInit
    expect(JSON.parse(retry.body as string).requestId).toBe('44444444-4444-4444-8444-444444444444')
  })

  it('treats a MIME lookalike as invalid and cancels its reader', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({cancel() { cancelled = true }})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, {headers: {'content-type': 'text/event-streaming'}})))
    render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={vi.fn()}/>)
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await screen.findByRole('alert')
    expect(cancelled).toBe(true)
  })

  it('finalizes the pending human exactly once and ignores trailing frames after assistant completion', async () => {
    const human = {id: '22222222-2222-4222-8222-222222222222', role: 'human', body: 'Hello', deliveryState: 'pending', createdAt: '2026-09-01T00:00:00.000Z'}
    const assistant = {id: '33333333-3333-4333-8333-333333333333', role: 'assistant', body: 'Complete', deliveryState: 'sent', createdAt: '2026-09-01T00:00:01.000Z'}
    const stream = `data: ${JSON.stringify({type: 'human_message', message: human})}\n\ndata: ${JSON.stringify({type: 'assistant_complete', message: assistant})}\n\ndata: not-json\n\n`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, {headers: {'content-type': 'text/event-stream'}})))
    const onMessages = vi.fn()
    render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={onMessages}/>)
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await waitFor(() => expect(onMessages).toHaveBeenLastCalledWith([expect.objectContaining({id: human.id, deliveryState: 'sent'}), expect.objectContaining({id: assistant.id})]))
    expect(screen.queryByRole('button', {name: 'Retry'})).toBeNull()
  })

  it('does not write a failed state after unmount cancels a live reader', async () => {
    const human = {id: '22222222-2222-4222-8222-222222222222', role: 'human', body: 'Hello', deliveryState: 'pending', createdAt: '2026-09-01T00:00:00.000Z'}
    const body = new ReadableStream<Uint8Array>({start(controller) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({type: 'human_message', message: human})}\n\n`)) }})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, {headers: {'content-type': 'text/event-stream'}})))
    const onMessages = vi.fn()
    const {unmount} = render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={onMessages}/>)
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await waitFor(() => expect(onMessages).toHaveBeenCalledTimes(2))
    const callsBeforeUnmount = onMessages.mock.calls.length
    unmount()
    await Promise.resolve()
    await Promise.resolve()
    expect(onMessages).toHaveBeenCalledTimes(callsBeforeUnmount)
  })

  it('cancels a late response without publishing when fetch resolves after unmount', async () => {
    let resolve!: (response: Response) => void
    const cancelled = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    const onMessages = vi.fn()
    const {unmount} = render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={onMessages}/>)
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    const callsBeforeUnmount = onMessages.mock.calls.length
    unmount()
    const getReader = vi.fn()
    resolve({status: 200, ok: true, headers: new Headers({'content-type': 'text/event-stream'}), body: {cancelled: false, cancel: cancelled, getReader}} as unknown as Response)
    await Promise.resolve()
    await Promise.resolve()
    expect(cancelled).toHaveBeenCalledTimes(1)
    expect(getReader).not.toHaveBeenCalled()
    expect(onMessages).toHaveBeenCalledTimes(callsBeforeUnmount)
  })

  it('cancels and releases a live reader during unmount', async () => {
    let releaseRead!: (value: {done: boolean; value?: Uint8Array}) => void
    const cancel = vi.fn().mockResolvedValue(undefined), releaseLock = vi.fn()
    const reader = {read: vi.fn().mockReturnValue(new Promise((done) => { releaseRead = done })), cancel, releaseLock}
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({status: 200, ok: true, headers: new Headers({'content-type': 'text/event-stream'}), body: {getReader: () => reader}}))
    const {unmount} = render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={vi.fn()}/>)
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await waitFor(() => expect(reader.read).toHaveBeenCalledTimes(1))
    unmount()
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
    expect(releaseLock).toHaveBeenCalledTimes(1)
    releaseRead({done: true})
  })

  it('cancels an unauthorized response body before redirecting to full-page sign-in', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    const assign = vi.fn()
    vi.stubGlobal('location', {assign})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({status: 401, ok: false, headers: new Headers(), body: {cancel}}))
    render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={vi.fn()}/>)
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
    expect(assign).toHaveBeenCalledWith(`/en/auth/sign-in?next=${encodeURIComponent(`/en/messages/${id}`)}`)
  })

  it('cancels and releases a reader when normal EOF is protocol-invalid', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined), releaseLock = vi.fn()
    const reader = {read: vi.fn().mockResolvedValue({done: true}), cancel, releaseLock}
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({status: 200, ok: true, headers: new Headers({'content-type': 'text/event-stream'}), body: {getReader: () => reader}}))
    render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={vi.fn()}/>)
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await screen.findByRole('alert')
    expect(cancel).toHaveBeenCalled()
    expect(releaseLock).toHaveBeenCalled()
  })

  it('cancels and releases the reader immediately after assistant completion', async () => {
    const human = {id: '22222222-2222-4222-8222-222222222222', role: 'human', body: 'Hello', deliveryState: 'pending', createdAt: '2026-09-01T00:00:00.000Z'}
    const assistant = {id: '33333333-3333-4333-8333-333333333333', role: 'assistant', body: 'Done', deliveryState: 'sent', createdAt: '2026-09-01T00:00:01.000Z'}
    const value = new TextEncoder().encode(`data: ${JSON.stringify({type: 'human_message', message: human})}\n\ndata: ${JSON.stringify({type: 'assistant_complete', message: assistant})}\n\n`)
    const cancel = vi.fn().mockResolvedValue(undefined), releaseLock = vi.fn()
    const reader = {read: vi.fn().mockResolvedValue({done: false, value}), cancel, releaseLock}
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({status: 200, ok: true, headers: new Headers({'content-type': 'text/event-stream'}), body: {getReader: () => reader}}))
    render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={vi.fn()}/>)
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
    expect(releaseLock).toHaveBeenCalled()
  })

  it('cancels an error response body before showing a localized failure', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({status: 503, ok: false, headers: new Headers(), body: {cancel}}))
    render(<ChatComposer conversationId={id} labels={labels} locale="en" onMessages={vi.fn()}/>)
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await screen.findByRole('alert')
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
