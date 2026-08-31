import {randomUUID} from 'node:crypto'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {createDifyChatPort, difyChatPortFromEnv} from './dify-chat.js'

const input = {
  humanProfileId: randomUUID(),
  ipProfileId: randomUUID(),
  message: 'Hello there',
  conversationId: randomUUID(),
  locale: 'zh-CN' as const,
  requestId: randomUUID(),
}

afterEach(() => vi.restoreAllMocks())

describe('Dify chat adapter', () => {
  it('sends the exact blocking request and maps the validated response', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      answer: 'Hi',
      conversation_id: input.conversationId,
      message_id: randomUUID(),
      created_at: 1_788_264_000,
    }), {status: 200, headers: {'content-type': 'application/json'}}))
    const port = createDifyChatPort({baseUrl: 'https://dify.example.test/', apiKey: 'secret-key', fetcher})

    const result = await port.sendMessage(input)

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://dify.example.test/v1/chat-messages')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers)).toEqual(new Headers({
      authorization: 'Bearer secret-key',
      'content-type': 'application/json',
      'x-request-id': input.requestId,
    }))
    expect(JSON.parse(String(init?.body))).toEqual({
      inputs: {ip_profile_id: input.ipProfileId, locale: 'zh-CN'},
      query: 'Hello there',
      response_mode: 'blocking',
      conversation_id: input.conversationId,
      user: input.humanProfileId,
      files: [],
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(result).toEqual({
      answer: 'Hi',
      conversationId: input.conversationId,
      messageId: expect.any(String),
      createdAt: '2026-09-01T12:00:00.000Z',
    })
  })

  it('uses an empty provider conversation id for a new conversation', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      answer: 'Hi', conversation_id: randomUUID(), message_id: randomUUID(),
    })))
    const port = createDifyChatPort({baseUrl: 'https://dify.example.test', apiKey: 'key', fetcher})

    await port.sendMessage({...input, conversationId: undefined})

    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).conversation_id).toBe('')
  })

  it('appends the Dify path to the configured base URL', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      answer: 'Hi', conversation_id: randomUUID(), message_id: randomUUID(),
    })))
    const port = createDifyChatPort({baseUrl: 'https://gateway.example.test/dify/', apiKey: 'key', fetcher})

    await port.sendMessage({...input, conversationId: undefined})

    expect(fetcher.mock.calls[0]![0]).toBe('https://gateway.example.test/dify/v1/chat-messages')
  })

  it('rejects provider errors and malformed provider responses without exposing details', async () => {
    const failing = createDifyChatPort({
      baseUrl: 'https://dify.example.test',
      apiKey: 'top-secret',
      fetcher: async () => new Response('provider stack trace top-secret', {status: 500}),
    })
    const malformed = createDifyChatPort({
      baseUrl: 'https://dify.example.test',
      apiKey: 'top-secret',
      fetcher: async () => new Response(JSON.stringify({answer: 4}), {status: 200}),
    })

    for (const port of [failing, malformed]) {
      await expect(port.sendMessage(input)).rejects.toMatchObject({name: 'ChatProviderError'})
      await expect(port.sendMessage(input)).rejects.not.toThrow(/top-secret|stack trace/)
    }
  })

  it('returns no adapter when either required environment value is empty', () => {
    expect(difyChatPortFromEnv({DIFY_API_URL: '', DIFY_API_KEY: 'key'})).toBeUndefined()
    expect(difyChatPortFromEnv({DIFY_API_URL: 'https://dify.example.test', DIFY_API_KEY: '  '})).toBeUndefined()
  })
})
