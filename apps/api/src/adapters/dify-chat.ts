import {ChatProviderError, type ChatPort, type ProviderChatDelta, type ProviderChatResult, type SendChatMessageInput} from '../ports/chat.js'

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type DifyChatOptions = {
  baseUrl: string
  apiKey: string
  fetcher?: Fetcher
}

type DifyEnvironment = {
  DIFY_API_URL?: string
  DIFY_API_KEY?: string
}

const MAX_BUFFERED_BYTES = 64 * 1024
const MAX_RAW_ANSWER_BYTES = 64 * 1024
const MAX_WIRE_BYTES = 4 * 1024 * 1024
const MAX_ANSWER_LENGTH = 4_000
const MAX_PROVIDER_ID_LENGTH = 512
const encoder = new TextEncoder()
const IGNORED_EVENTS = new Set([
  'ping',
  'message_file',
  'agent_thought',
  'tts_message',
  'tts_message_end',
  'workflow_started',
  'workflow_finished',
  'node_started',
  'node_finished',
])

function providerError(): ChatProviderError {
  return new ChatProviderError()
}

/** Hold possible tag prefixes until resolved; never retain hidden thought text. */
function visibleAnswerStream() {
  const open = '<think>', close = '</think>'
  let pending = '', depth = 0
  return {
    push(text: string): string {
      let visible = ''
      for (const character of text) {
        pending += character
        while (pending) {
          if (pending === open) { depth += 1; pending = ''; break }
          if (depth > 0 && pending === close) { depth -= 1; pending = ''; break }
          if (open.startsWith(pending) || (depth > 0 && close.startsWith(pending))) break
          if (depth === 0) visible += pending[0]
          pending = pending.slice(1)
        }
      }
      return visible
    },
    finish(): string {
      if (depth !== 0) throw providerError()
      const visible = pending
      pending = ''
      return visible
    },
  }
}

function boundedText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length >= 1 && value.length <= MAX_PROVIDER_ID_LENGTH ? value : undefined
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function parseEvent(data: string): Record<string, unknown> {
  try {
    const value = object(JSON.parse(data))
    if (!value) throw new Error('not an object')
    return value
  } catch {
    throw providerError()
  }
}

function isSse(response: Response): boolean {
  return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'text/event-stream'
}

function hasNonCommentText(lines: string[]): boolean {
  return lines.some((line) => line.trim().length > 0 && !line.startsWith(':'))
}

function combinedSignal(callerSignal: AbortSignal | undefined, cancellation: AbortController): AbortSignal {
  const signals = [AbortSignal.timeout(30_000), cancellation.signal]
  if (callerSignal) signals.push(callerSignal)
  return AbortSignal.any(signals)
}

function requestOptions(input: SendChatMessageInput, apiKey: string, signal: AbortSignal): RequestInit {
  return {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Request-ID': input.requestId,
    },
    body: JSON.stringify({
      inputs: {ip_profile_id: input.ipProfileId, locale: input.locale},
      query: input.message,
      response_mode: 'streaming',
      conversation_id: input.providerConversationId ?? '',
      user: input.humanProfileId,
      files: [],
    }),
    signal,
  }
}

export function createDifyChatPort({baseUrl, apiKey, fetcher = fetch}: DifyChatOptions): ChatPort {
  const endpoint = new URL(`${baseUrl.replace(/\/+$/, '')}/chat-messages`).toString()

  return {
    async *streamMessage(input): AsyncGenerator<ProviderChatDelta, ProviderChatResult> {
      const cancellation = new AbortController()
      const signal = combinedSignal(input.signal, cancellation)
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      let cancelReader: (() => void) | undefined

      try {
        let response: Response
        try {
          response = await fetcher(endpoint, requestOptions(input, apiKey, signal))
        } catch {
          throw providerError()
        }
        if (!response.ok || !isSse(response) || !response.body) throw providerError()

        reader = response.body.getReader()
        cancelReader = () => {
          void reader?.cancel().catch(() => undefined)
        }
        signal.addEventListener('abort', cancelReader, {once: true})
        if (signal.aborted) throw providerError()
        const decoder = new TextDecoder('utf-8', {fatal: true})
        let buffered = ''
        let frameLines: string[] = []
        let answer = ''
        let wireBytes = 0, rawAnswerBytes = 0
        const visibleStream = visibleAnswerStream()
        let providerConversationId: string | undefined
        let providerMessageId: string | undefined
        let terminal: ProviderChatResult | undefined

        const registerIds = (value: Record<string, unknown>) => {
          const conversationId = boundedText(value.conversation_id)
          const messageId = boundedText(value.message_id)
          if (!conversationId || !messageId) throw providerError()
          if (input.providerConversationId && conversationId !== input.providerConversationId) throw providerError()
          if ((providerConversationId && providerConversationId !== conversationId) || (providerMessageId && providerMessageId !== messageId)) {
            throw providerError()
          }
          providerConversationId = conversationId
          providerMessageId = messageId
        }

        const consumeFrame = (lines: string[]) => {
          const data = lines
            .filter((line) => !line.startsWith(':') && line.startsWith('data:'))
            .map((line) => line.slice(5).replace(/^ /, ''))
            .join('\n')
          if (!data) return undefined
          if (encoder.encode(data).byteLength > MAX_BUFFERED_BYTES) throw providerError()
          if (terminal) throw providerError()

          const value = parseEvent(data)
          const event = value.event
          if (event === 'error') throw providerError()
          if (typeof event === 'string' && IGNORED_EVENTS.has(event)) return undefined
          if (event !== 'message' && event !== 'agent_message' && event !== 'message_end') throw providerError()
          if (event === 'message' || event === 'agent_message') {
            if (typeof value.answer !== 'string') throw providerError()
            registerIds(value)
            rawAnswerBytes += encoder.encode(value.answer).byteLength
            if (rawAnswerBytes > MAX_RAW_ANSWER_BYTES) throw providerError()
            const visible = visibleStream.push(value.answer)
            if (visible.length === 0) return undefined
            if (answer.length + visible.length > MAX_ANSWER_LENGTH) throw providerError()
            answer += visible
            return {type: 'delta' as const, delta: visible}
          }
          if (event === 'message_end') {
            registerIds(value)
            const tail = visibleStream.finish()
            if (answer.length + tail.length > MAX_ANSWER_LENGTH) throw providerError()
            answer += tail
            if (answer.length < 1) throw providerError()
            terminal = {answer, providerConversationId: providerConversationId!, providerMessageId: providerMessageId!}
            if (tail) return {type: 'delta' as const, delta: tail}
          }
          return undefined
        }

        const consumeBufferedLines = (): ProviderChatDelta[] => {
          const deltas: ProviderChatDelta[] = []
          while (true) {
            const newline = buffered.indexOf('\n')
            if (newline < 0) break
            let line = buffered.slice(0, newline)
            buffered = buffered.slice(newline + 1)
            if (line.endsWith('\r')) line = line.slice(0, -1)
            if (line === '') {
              const delta = consumeFrame(frameLines)
              frameLines = []
              if (delta) deltas.push(delta)
            } else {
              frameLines.push(line)
              if (encoder.encode(frameLines.join('\n')).byteLength > MAX_BUFFERED_BYTES) throw providerError()
            }
          }
          return deltas
        }

        while (!terminal) {
          try {
            const next = await reader.read()
            if (next.done) break
            wireBytes += next.value.byteLength
            if (wireBytes > MAX_WIRE_BYTES) throw providerError()
            buffered += decoder.decode(next.value, {stream: true})
          } catch {
            throw providerError()
          }
          if (encoder.encode(buffered).byteLength > MAX_BUFFERED_BYTES) throw providerError()
          for (const delta of consumeBufferedLines()) {
            if (signal.aborted) throw providerError()
            yield delta
          }
        }

        try {
          buffered += decoder.decode()
        } catch {
          throw providerError()
        }
        if (!terminal) {
          if (buffered.length > 0) {
            if (encoder.encode(buffered).byteLength > MAX_BUFFERED_BYTES) throw providerError()
            // An unfinished line cannot form a valid terminal SSE frame.
          }
          throw providerError()
        }
        if (hasNonCommentText(frameLines) || hasNonCommentText(buffered.split(/\r?\n/))) throw providerError()
        if (signal.aborted) throw providerError()
        return terminal
      } catch (error) {
        if (error instanceof ChatProviderError) throw error
        throw providerError()
      } finally {
        if (cancelReader) signal.removeEventListener('abort', cancelReader)
        cancellation.abort()
        if (reader) {
          try {
            await reader.cancel()
          } catch {
            // Cancellation is best-effort and must not reveal provider errors.
          }
          try {
            reader.releaseLock()
          } catch {
            // Releasing the lock is best-effort after cancellation.
          }
        }
      }
    },
  }
}

export function difyChatPortFromEnv(environment: DifyEnvironment = process.env): ChatPort | undefined {
  const baseUrl = environment.DIFY_API_URL?.trim()
  const apiKey = environment.DIFY_API_KEY?.trim()
  return baseUrl && apiKey ? createDifyChatPort({baseUrl, apiKey}) : undefined
}
