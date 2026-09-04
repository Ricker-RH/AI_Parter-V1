export interface RealtimeSocket {
  readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  send(value: string): void
  close(): void
}

export interface RealtimeTransportOptions {
  endpoint: string
  getTicket(signal: AbortSignal): Promise<string>
  webSocketFactory?: (endpoint: string) => RealtimeSocket
  onEvent: (event: HumanRealtimeEvent) => void
  /** Re-fetch authoritative history and explicitly resubscribe here. No local replay. */
  onAuthenticated: (context: {reconnected: boolean}) => void
  onStateChange?: (state: RealtimeState) => void
  reconnect?: {maxAttempts: number; baseDelayMs: number; maxDelayMs: number}
  dedupeCapacity?: number
  handshakeTimeoutMs?: number
  random?: () => number
}

export type RealtimeState = 'connecting' | 'authenticating' | 'ready' | 'reconnecting' | 'auth-required' | 'exhausted' | 'disposed'
export type RealtimeSubscription = {v: 1; type: 'subscribe' | 'unsubscribe'; conversationId: string}
export type RealtimeTyping = {v:1;type:'typing';conversationId:string;isTyping:boolean}

function isSubscription(value: RealtimeSubscription | RealtimeTyping): boolean {
  return !!value && value.v === 1 && ['subscribe', 'unsubscribe','typing'].includes(value.type)
    && typeof value.conversationId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.conversationId)
    && (value.type==='typing' ? typeof value.isTyping==='boolean' && Object.keys(value).length===4 : Object.keys(value).length === 3)
}

/** Inert until connect(); owns no storage, visibility listeners, or read receipts. */
export function createRealtimeTransport(options: RealtimeTransportOptions) {
  const endpoint = new URL(options.endpoint)
  if (endpoint.protocol !== 'wss:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('Realtime endpoint must be credential-free WSS without query or fragment')
  }
  let disposed = false
  let controller: AbortController | undefined
  let socket: RealtimeSocket | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let handshakeTimer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let blocked = false
  let ready = false
  let everAuthenticated = false
  let attempts = 0
  const seen = new Set<string>()
  const retry = options.reconnect ?? {maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 15_000}
  const capacity = options.dedupeCapacity ?? 512
  const handshakeTimeout = options.handshakeTimeoutMs ?? 10_000
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10_000
    || !Number.isSafeInteger(retry.maxAttempts) || retry.maxAttempts < 0 || retry.maxAttempts > 20
    || !Number.isFinite(handshakeTimeout) || handshakeTimeout < 1 || handshakeTimeout > 300_000
    || !Number.isFinite(retry.baseDelayMs) || retry.baseDelayMs < 1
    || !Number.isFinite(retry.maxDelayMs) || retry.maxDelayMs < retry.baseDelayMs || retry.maxDelayMs > 300_000) {
    throw new Error('Invalid realtime transport bounds')
  }
  const state = (value: RealtimeState) => options.onStateChange?.(value)
  function cleanup() {
    generation++
    ready = false
    controller?.abort()
    controller = undefined
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    if (handshakeTimer !== undefined) clearTimeout(handshakeTimer)
    handshakeTimer = undefined
    if (socket) {
      const previous = socket
      socket = undefined
      previous.onopen = previous.onmessage = previous.onclose = previous.onerror = null
      previous.close()
    }
  }
  function authRequired() {
    blocked = true
    cleanup()
    state('auth-required')
  }
  function reconnect() {
    cleanup()
    if (disposed || blocked) return
    if (attempts >= retry.maxAttempts) { blocked = true; state('exhausted'); return }
    const ceiling = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** attempts++)
    const sample = (options.random ?? Math.random)()
    const jitter = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0.5
    state('reconnecting')
    timer = setTimeout(() => { timer = undefined; void connect() }, ceiling * (0.5 + jitter / 2))
  }
  async function connect() {
    if (disposed || blocked || controller || socket || timer !== undefined) return
    const current = ++generation
    const pending = new AbortController()
    controller = pending
    state('connecting')
    let ticket: string
    try {
      ticket = await options.getTicket(pending.signal)
      if (current !== generation || disposed) return
      if (typeof ticket !== 'string' || !ticket.trim()) { authRequired(); return }
    } catch {
      if (current === generation && !disposed) authRequired()
      return
    }
    controller = undefined
    try {
      const connection = (options.webSocketFactory ?? (url => new WebSocket(url)))(endpoint.href)
      socket = connection
      const active = () => !disposed && current === generation && socket === connection
      handshakeTimer = setTimeout(() => { if (active()) reconnect() }, handshakeTimeout)
      connection.onopen = () => {
        if (!active()) return
        state('authenticating')
        try { connection.send(JSON.stringify({v: 1, type: 'auth', ticket})) }
        catch { reconnect() }
        finally { ticket = '' }
      }
      connection.onmessage = ({data}) => {
        if (!active() || typeof data !== 'string' || data.length > 262_144) return
        let value: unknown
        try { value = JSON.parse(data) } catch { return }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const control = value as {v?: unknown; type?: unknown}
          if (control.v === 1 && Object.keys(control).length === 2) {
            if (control.type === 'auth_error') { authRequired(); return }
            if (control.type === 'auth_ok' && !ready) {
              clearTimeout(handshakeTimer)
              handshakeTimer = undefined
              ready = true
              attempts = 0
              const reconnected = everAuthenticated
              everAuthenticated = true
              state('ready')
              options.onAuthenticated({reconnected})
              return
            }
          }
        }
        if (!ready) return
        const parsed = HumanRealtimeEventSchema.safeParse(value)
        if (!parsed.success) return
        const event = parsed.data
        // Revocation is security-critical even when its event ID was already seen.
        if (event.type === 'access_revoked') {
          authRequired()
          options.onEvent(event)
          return
        }
        if (seen.has(event.eventId)) return
        seen.add(event.eventId)
        if (seen.size > capacity) seen.delete(seen.values().next().value!)
        options.onEvent(event)
      }
      connection.onclose = ({code}) => {
        if (!active()) return
        if ([1008, 4401, 4403].includes(code)) authRequired()
        else reconnect()
      }
      // Browser errors omit close codes; wait for close to distinguish auth denial.
      connection.onerror = () => {}
    } catch { if (current === generation) reconnect() }
  }
  return {
    connect,
    send(envelope: RealtimeSubscription | RealtimeTyping): boolean {
      if (!ready || !socket || socket.readyState !== 1 || !isSubscription(envelope)) return false
      try { socket.send(JSON.stringify(envelope)); return true }
      catch { reconnect(); return false }
    },
    async refreshAuth() {
      if (disposed) return
      cleanup()
      blocked = false
      attempts = 0
      seen.clear()
      await connect()
    },
    dispose() {
      if (disposed) return
      disposed = true
      cleanup()
      seen.clear()
      state('disposed')
    },
  }
}
import {HumanRealtimeEventSchema, type HumanRealtimeEvent} from '@aifans/contracts'
