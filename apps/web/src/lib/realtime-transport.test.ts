import {afterEach, describe, expect, it, vi} from 'vitest'
import * as transportModule from './realtime-transport.js'

class FakeSocket {
  readyState = 0
  onopen: transportModule.RealtimeSocket['onopen'] = null
  onmessage: transportModule.RealtimeSocket['onmessage'] = null
  onclose: transportModule.RealtimeSocket['onclose'] = null
  onerror: transportModule.RealtimeSocket['onerror'] = null
  sent: string[] = []
  send(value: string) { this.sent.push(value) }
  close() { this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.(new Event('open')) }
  receive(value: unknown) { this.onmessage?.(new MessageEvent('message', {data: JSON.stringify(value)})) }
  drop(code = 1006) { this.readyState = 3; this.onclose?.(new CloseEvent('close', {code})) }
}

function setup(overrides: Record<string, unknown> = {}) {
  const sockets: FakeSocket[] = []
  const getTicket = vi.fn(async () => 'short-lived-secret')
  const onEvent = vi.fn()
  const onAuthenticated = vi.fn()
  const onStateChange = vi.fn()
  const webSocketFactory = vi.fn(() => { const socket = new FakeSocket(); sockets.push(socket); return socket })
  const transport = transportModule.createRealtimeTransport({
    endpoint: 'wss://realtime.example/socket', getTicket, webSocketFactory,
    onEvent, onAuthenticated, onStateChange, ...overrides,
  })
  return {transport, sockets, getTicket, onEvent, onAuthenticated, onStateChange, webSocketFactory}
}

const conversationId = '11111111-1111-4111-8111-111111111111'
const subscribe = {v: 1, type: 'subscribe', conversationId} as const
const event = {v: 1, type: 'read', eventId: '22222222-2222-4222-8222-222222222222', conversationId,
  occurredAt: '2026-09-04T01:00:00.000Z', profileId: '33333333-3333-4333-8333-333333333333', lastReadSequence: 0}

afterEach(() => vi.useRealTimers())

describe('provider-neutral realtime transport', () => {
  it('sends typing without client identity only after authentication',async()=>{
    const h=setup(); const typing={v:1,type:'typing',conversationId,isTyping:true} as const;
    expect(h.transport.send(typing)).toBe(false);
    await h.transport.connect();const socket=h.sockets[0]!;socket.open();socket.receive({v:1,type:'auth_ok'});
    expect(h.transport.send(typing)).toBe(true);
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual(typing);
    expect(h.transport.send({...typing,profileId:conversationId} as never)).toBe(false);
    expect(h.transport.send({...typing,isTyping:'yes'} as never)).toBe(false);
    h.transport.dispose();expect(h.transport.send(typing)).toBe(false);
  });
  it('exports a transport constructor', () => {
    expect(transportModule).toHaveProperty('createRealtimeTransport')
  })

  it.each(['ws://example/socket', 'https://example/socket', 'wss://user:password@example/socket', 'wss://example/socket?ticket=secret', 'wss://example/socket#secret'])('rejects unsafe endpoint %s before requesting tickets', endpoint => {
    expect(() => setup({endpoint})).toThrow()
  })

  it('cancels pending ticket retrieval and ignores its late result after disposal', async () => {
    let resolve!: (ticket: string) => void
    const getTicket = vi.fn((signal: AbortSignal) => new Promise<string>(done => { resolve = done; expect(signal.aborted).toBe(false) }))
    const h = setup({getTicket})
    const connecting = h.transport.connect()
    h.transport.dispose()
    expect(getTicket.mock.calls[0]![0].aborted).toBe(true)
    resolve('never-open-socket')
    await connecting
    expect(h.sockets).toHaveLength(0)
    await h.transport.connect()
    expect(getTicket).toHaveBeenCalledTimes(1)
  })

  it('authenticates in the first frame and gates subscriptions on acknowledgement', async () => {
    const h = setup()
    expect(h.transport.send(subscribe)).toBe(false)
    await h.transport.connect()
    await h.transport.connect()
    expect(h.sockets).toHaveLength(1)
    expect(h.webSocketFactory).toHaveBeenCalledWith('wss://realtime.example/socket')
    const socket = h.sockets[0]!
    socket.open()
    expect(socket.sent.map(value => JSON.parse(value))).toEqual([{v: 1, type: 'auth', ticket: 'short-lived-secret'}])
    expect(h.transport.send(subscribe)).toBe(false)
    socket.receive(event)
    expect(h.onEvent).not.toHaveBeenCalled()
    socket.receive({v: 1, type: 'auth_ok', unexpected: true})
    expect(h.transport.send(subscribe)).toBe(false)
    socket.receive({v: 1, type: 'auth_ok'})
    expect(h.onAuthenticated).toHaveBeenCalledExactlyOnceWith({reconnected: false})
    expect(h.transport.send(subscribe)).toBe(true)
    expect(h.transport.send({v: 1, type: 'auth', ticket: 'injected'} as never)).toBe(false)
    h.transport.dispose()
    expect(socket.onmessage).toBeNull()
    expect(socket.readyState).toBe(3)
  })

  it('validates events and deduplicates using a bounded cache', async () => {
    const h = setup({dedupeCapacity: 1})
    await h.transport.connect()
    const socket = h.sockets[0]!
    socket.open(); socket.receive({v: 1, type: 'auth_ok'})
    socket.receive({...event, lastReadSequence: -1})
    socket.receive({...event, privateField: 'secret'})
    socket.onmessage?.(new MessageEvent('message', {data: 'not json'}))
    socket.receive(event); socket.receive(event)
    expect(h.onEvent).toHaveBeenCalledTimes(1)
    socket.receive({...event, eventId: '44444444-4444-4444-8444-444444444444'})
    socket.receive(event)
    expect(h.onEvent).toHaveBeenCalledTimes(3)
    h.transport.dispose()
  })

  it('bounds jittered exponential retries and calls catchup after reauthentication', async () => {
    vi.useFakeTimers()
    const h = setup({reconnect: {maxAttempts: 2, baseDelayMs: 100, maxDelayMs: 200}, random: () => 0.5})
    await h.transport.connect()
    h.sockets[0]!.open(); h.sockets[0]!.receive({v: 1, type: 'auth_ok'}); h.sockets[0]!.drop()
    await vi.advanceTimersByTimeAsync(74)
    expect(h.sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(h.sockets).toHaveLength(2)
    h.sockets[1]!.open(); h.sockets[1]!.receive({v: 1, type: 'auth_ok'})
    expect(h.onAuthenticated).toHaveBeenLastCalledWith({reconnected: true})
    h.sockets[1]!.drop()
    await vi.advanceTimersByTimeAsync(75)
    h.sockets[2]!.drop()
    await vi.advanceTimersByTimeAsync(150)
    h.sockets[3]!.drop()
    await vi.runAllTimersAsync()
    expect(h.sockets).toHaveLength(4)
    expect(h.onStateChange).toHaveBeenLastCalledWith('exhausted')
    h.transport.dispose()
  })

  it.each(['auth_error', 'access_revoked', 1008, 4401, 4403])('stops retries after %s until explicit fresh authentication', async failure => {
    vi.useFakeTimers()
    const h = setup()
    await h.transport.connect()
    const socket = h.sockets[0]!
    socket.open()
    if (typeof failure === 'number') socket.drop(failure)
    else if (failure === 'auth_error') socket.receive({v: 1, type: failure})
    else {
      socket.receive({v: 1, type: 'auth_ok'})
      const revoked = {v: 1, type: failure, eventId: event.eventId, conversationId, occurredAt: event.occurredAt, reason: 'blocked'}
      socket.receive(revoked)
      expect(h.onEvent).toHaveBeenCalledWith(revoked)
    }
    expect(h.transport.send(subscribe)).toBe(false)
    await h.transport.connect()
    await vi.runAllTimersAsync()
    expect(h.sockets).toHaveLength(1)
    expect(h.onStateChange).toHaveBeenLastCalledWith('auth-required')
    await h.transport.refreshAuth()
    expect(h.getTicket).toHaveBeenCalledTimes(2)
    expect(h.sockets).toHaveLength(2)
    h.transport.dispose()
  })

  it('does not leak ticket provider errors and requires refresh after ticket rejection', async () => {
    vi.useFakeTimers()
    const h = setup({getTicket: async () => { throw new Error('secret-ticket') }})
    await expect(h.transport.connect()).resolves.toBeUndefined()
    await vi.runAllTimersAsync()
    expect(h.onStateChange).toHaveBeenLastCalledWith('auth-required')
    expect(JSON.stringify(h.onStateChange.mock.calls)).not.toContain('secret-ticket')
    h.transport.dispose()
  })

  it('cleans up scheduled reconnect and never sends automatic reads on page visibility', async () => {
    vi.useFakeTimers()
    const h = setup()
    await h.transport.connect()
    h.sockets[0]!.open(); h.sockets[0]!.receive({v: 1, type: 'auth_ok'})
    document.dispatchEvent(new Event('visibilitychange'))
    expect(h.sockets[0]!.sent).toHaveLength(1)
    h.sockets[0]!.drop()
    h.transport.dispose()
    await vi.runAllTimersAsync()
    expect(h.sockets).toHaveLength(1)
  })

  it('waits for the close code after an error so authorization failures cannot retry', async () => {
    vi.useFakeTimers()
    const h = setup()
    await h.transport.connect()
    h.sockets[0]!.open()
    h.sockets[0]!.onerror?.(new Event("error"))
    h.sockets[0]!.drop(4401)
    await vi.runAllTimersAsync()
    expect(h.sockets).toHaveLength(1)
    expect(h.onStateChange).toHaveBeenLastCalledWith('auth-required')
    h.transport.dispose()
  })

  it('times out an unacknowledged handshake and bounds retry attempts', async () => {
    vi.useFakeTimers()
    const h = setup({handshakeTimeoutMs: 100, reconnect: {maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 10}, random: () => 1})
    await h.transport.connect()
    h.sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(110)
    expect(h.sockets).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(100)
    expect(h.onStateChange).toHaveBeenLastCalledWith('exhausted')
    h.transport.dispose()
  })
})
