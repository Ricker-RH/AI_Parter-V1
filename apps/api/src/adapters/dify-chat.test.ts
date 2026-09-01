import {randomUUID} from 'node:crypto'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {ChatProviderError, type SendChatMessageInput} from '../ports/chat.js'
import {createDifyChatPort, difyChatPortFromEnv} from './dify-chat.js'

const encoder = new TextEncoder()
const input = {
  humanProfileId: randomUUID(),
  ipProfileId: randomUUID(),
  message: 'Hello there',
  providerConversationId: 'conv_external_01',
  locale: 'zh-CN' as const,
  requestId: randomUUID(),
  signal: new AbortController().signal,
} satisfies SendChatMessageInput

function sseResponse(chunks: string[], options: {status?: number; contentType?: string} = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, {status: options.status ?? 200, headers: {'content-type': options.contentType ?? 'text/event-stream; charset=utf-8'}})
}

function event(value: Record<string, unknown>, newline = '\n') {
  return `data: ${JSON.stringify(value)}${newline}${newline}`
}

async function collect(port: ReturnType<typeof createDifyChatPort>, request = input) {
  const stream = port.streamMessage(request)
  const deltas: string[] = []
  let next = await stream.next()
  while (!next.done) {
    deltas.push(next.value.delta)
    next = await stream.next()
  }
  return {deltas, result: next.value}
}

afterEach(() => vi.restoreAllMocks())

describe('Dify chat adapter', () => {
  it('sends the exact streaming request and returns only internal deltas and terminal ids', async () => {
    const fetcher = vi.fn(async () => sseResponse([
      event({event: 'message', answer: 'Hi ', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}),
      event({event: 'message', answer: 'there', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}),
      event({event: 'message_end', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}),
    ]))
    const port = createDifyChatPort({baseUrl: 'https://api.dify.ai/v1/', apiKey: 'secret-key', fetcher})

    await expect(collect(port)).resolves.toEqual({
      deltas: ['Hi ', 'there'],
      result: {answer: 'Hi there', providerConversationId: 'conv_external_01', providerMessageId: 'msg_external_01'},
    })

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://api.dify.ai/v1/chat-messages')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers)).toEqual(new Headers({
      authorization: 'Bearer secret-key',
      'content-type': 'application/json',
      'x-request-id': input.requestId,
    }))
    expect(JSON.parse(String(init?.body))).toEqual({
      inputs: {ip_profile_id: input.ipProfileId, locale: 'zh-CN'},
      query: 'Hello there',
      response_mode: 'streaming',
      conversation_id: 'conv_external_01',
      user: input.humanProfileId,
      files: [],
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('uses an empty provider conversation id for a new conversation', async () => {
    const fetcher = vi.fn(async () => sseResponse([
      event({event: 'message', answer: 'new', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}),
      event({event: 'message_end', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}),
    ]))
    const port = createDifyChatPort({baseUrl: 'https://api.dify.ai/v1', apiKey: 'key', fetcher})

    await collect(port, {...input, providerConversationId: undefined})
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).conversation_id).toBe('')
  })

  it('decodes split UTF-8 and SSE frames, comments, CRLF, and multiline data in order', async () => {
    const first = '你好'
    const bytes = encoder.encode(`: heartbeat\r\ndata: {"event":"message",\r\ndata: "answer":"${first}","conversation_id":"conv_external_01","message_id":"msg_external_01"}\r\n\r\n`)
    const split = [bytes.slice(0, 3), bytes.slice(3, 17), bytes.slice(17)]
    const tail = encoder.encode(event({event: 'message', answer: '!', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}) + event({event: 'message_end', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}))
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of [...split, tail]) controller.enqueue(chunk)
        controller.close()
      },
    })
    const port = createDifyChatPort({baseUrl: 'https://api.dify.ai/v1', apiKey: 'key', fetcher: async () => new Response(body, {headers: {'content-type': 'text/event-stream'}})})

    await expect(collect(port)).resolves.toEqual({
      deltas: ['你好', '!'],
      result: {answer: '你好!', providerConversationId: 'conv_external_01', providerMessageId: 'msg_external_01'},
    })
  })

  it('ignores known Dify progress events that do not carry text or provider ids', async () => {
    const port = createDifyChatPort({
      baseUrl: 'https://api.dify.ai/v1', apiKey: 'key',
      fetcher: async () => sseResponse([
        event({event: 'ping'}),
        event({event: 'agent_thought', thought: 'working'}),
        event({event: 'message', answer: 'done', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}),
        event({event: 'message_end', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}),
      ]),
    })

    await expect(collect(port)).resolves.toEqual({
      deltas: ['done'],
      result: {answer: 'done', providerConversationId: 'conv_external_01', providerMessageId: 'msg_external_01'},
    })
  })

  it('normalizes non-SSE, status, malformed, overlong, missing terminal, changed-id, and provider-error failures without secret leakage', async () => {
    const secret = 'top-secret-provider-body'
    const failures = [
      async () => new Response(secret, {status: 502}),
      async () => new Response(event({event: 'message_end', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}), {headers: {'content-type': 'application/json'}}),
      async () => sseResponse(['data: {nope}\n\n']),
      async () => sseResponse([event({event: 'message', answer: 'x'.repeat(4001), conversation_id: 'conv_external_01', message_id: 'msg_external_01'})]),
      async () => sseResponse([event({event: 'message', answer: 'fine', conversation_id: 'conv_external_01', message_id: 'msg_external_01'})]),
      async () => sseResponse([event({event: 'message_end', conversation_id: 'conv_external_01', message_id: 'msg_external_01'})]),
      async () => sseResponse([event({event: 'unexpected_progress'}), event({event: 'message', answer: 'one', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}), event({event: 'message_end', conversation_id: 'conv_external_01', message_id: 'msg_external_01'})]),
      async () => sseResponse([event({event: 'message_replace', answer: 'replacement', conversation_id: 'conv_external_01', message_id: 'msg_external_01'})]),
      async () => sseResponse([event({event: 'message', answer: 'one', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}), event({event: 'message_end', conversation_id: 'different', message_id: 'msg_external_01'})]),
      async () => sseResponse([event({event: 'message', answer: 'one', conversation_id: 'provider_other_conversation', message_id: 'msg_external_01'}), event({event: 'message_end', conversation_id: 'provider_other_conversation', message_id: 'msg_external_01'})]),
      async () => sseResponse([event({event: 'message', answer: 'one', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}) + event({event: 'message_end', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}) + event({event: 'message', answer: 'two', conversation_id: 'conv_external_01', message_id: 'msg_external_01'})]),
      async () => sseResponse([event({event: 'message', answer: 'one', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}) + event({event: 'message_end', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}) + 'data: {"event":"message"']),
      async () => sseResponse([event({event: 'error', message: secret})]),
      async () => sseResponse([`data: ${'x'.repeat(65_537)}\n\n`]),
      async () => sseResponse([event({event: 'message_end', conversation_id: 'x'.repeat(513), message_id: 'msg_external_01'})]),
    ]

    for (const fetcher of failures) {
      const port = createDifyChatPort({baseUrl: 'https://dify.example.test', apiKey: 'top-secret-api-key', fetcher})
      await expect(collect(port)).rejects.toBeInstanceOf(ChatProviderError)
      await expect(collect(port)).rejects.not.toThrow(/top-secret-provider-body|top-secret-api-key/)
    }
  })

  it('propagates caller cancellation and cancels the upstream reader when the generator is returned early', async () => {
    let upstreamSignal: AbortSignal | undefined
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode(event({event: 'message', answer: 'one', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}))) },
      cancel() { cancelled = true },
    })
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      upstreamSignal = init?.signal ?? undefined
      return new Response(body, {headers: {'content-type': 'text/event-stream'}})
    })
    const caller = new AbortController()
    const port = createDifyChatPort({baseUrl: 'https://dify.example.test', apiKey: 'key', fetcher})

    const stream = port.streamMessage({...input, signal: caller.signal})
    await expect(stream.next()).resolves.toMatchObject({value: {delta: 'one'}, done: false})
    await stream.return(undefined)
    expect(cancelled).toBe(true)
    expect(upstreamSignal?.aborted).toBe(true)

    const aborted = port.streamMessage({...input, signal: AbortSignal.abort()})
    await expect(aborted.next()).rejects.toBeInstanceOf(ChatProviderError)
  })

  it('cancels an active upstream reader when the caller aborts', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({cancel() { cancelled = true }})
    const caller = new AbortController()
    const port = createDifyChatPort({
      baseUrl: 'https://dify.example.test', apiKey: 'key',
      fetcher: async () => new Response(body, {headers: {'content-type': 'text/event-stream'}}),
    })
    const stream = port.streamMessage({...input, signal: caller.signal})
    const next = stream.next()
    await Promise.resolve()
    caller.abort()
    const outcome = await Promise.race([
      next.then(() => 'resolved', () => 'rejected'),
      new Promise((resolve) => setTimeout(() => resolve('timed out'), 25)),
    ])

    expect(outcome).toBe('rejected')
    expect(cancelled).toBe(true)
    await expect(next).rejects.toBeInstanceOf(ChatProviderError)
  })

  it('does not yield a buffered delta or return a terminal result after a caller abort', async () => {
    const caller = new AbortController()
    const port = createDifyChatPort({
      baseUrl: 'https://dify.example.test', apiKey: 'key',
      fetcher: async () => sseResponse([
        event({event: 'message', answer: 'A', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}) + event({event: 'message', answer: 'B', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}) + event({event: 'message_end', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}),
      ]),
    })
    const stream = port.streamMessage({...input, signal: caller.signal})

    await expect(stream.next()).resolves.toMatchObject({value: {delta: 'A'}, done: false})
    caller.abort()
    await expect(stream.next()).rejects.toBeInstanceOf(ChatProviderError)
  })

  it('releases the upstream reader lock after finishing the stream', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(event({event: 'message', answer: 'done', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}) + event({event: 'message_end', conversation_id: 'conv_external_01', message_id: 'msg_external_01'})))
        controller.close()
      },
    })
    const port = createDifyChatPort({
      baseUrl: 'https://dify.example.test', apiKey: 'key',
      fetcher: async () => new Response(body, {headers: {'content-type': 'text/event-stream'}}),
    })

    await collect(port)
    expect(body.locked).toBe(false)
  })

  it('configures a local 30 second abort signal and has no adapter without both environment values', async () => {
    let signal: AbortSignal | undefined
    const timeout = new AbortController()
    const timeoutSignal = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal)
    const port = createDifyChatPort({
      baseUrl: 'https://dify.example.test', apiKey: 'key',
      fetcher: async (_url, init) => {
        signal = init?.signal ?? undefined
        return sseResponse([
          event({event: 'message', answer: 'done', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}),
          event({event: 'message_end', conversation_id: 'conv_external_01', message_id: 'msg_external_01'}),
        ])
      },
    })
    await collect(port)
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(timeoutSignal).toHaveBeenCalledWith(30_000)
    expect(difyChatPortFromEnv({DIFY_API_URL: '', DIFY_API_KEY: 'key'})).toBeUndefined()
    expect(difyChatPortFromEnv({DIFY_API_URL: 'https://dify.example.test', DIFY_API_KEY: '  '})).toBeUndefined()
  })
})
