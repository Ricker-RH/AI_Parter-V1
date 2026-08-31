import {ChatMessageResponseSchema} from '@aifans/contracts'
import {z} from 'zod'
import {ChatProviderError, type ChatPort} from '../ports/chat.js'

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

const DifyBlockingResponseSchema = z.object({
  answer: z.string(),
  conversation_id: z.uuid(),
  message_id: z.uuid(),
  created_at: z.number().int().nonnegative().optional(),
})

function providerError(cause?: unknown): ChatProviderError {
  return new ChatProviderError(cause)
}

export function createDifyChatPort({baseUrl, apiKey, fetcher = fetch}: DifyChatOptions): ChatPort {
  const endpoint = new URL(`${baseUrl.replace(/\/+$/, '')}/v1/chat-messages`).toString()

  return {
    async sendMessage(input) {
      let response: Response
      try {
        response = await fetcher(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-Request-ID': input.requestId,
          },
          body: JSON.stringify({
            inputs: {ip_profile_id: input.ipProfileId, locale: input.locale},
            query: input.message,
            response_mode: 'blocking',
            conversation_id: input.conversationId ?? '',
            user: input.humanProfileId,
            files: [],
          }),
          signal: AbortSignal.timeout(30_000),
        })
      } catch (error) {
        throw providerError(error)
      }

      if (!response.ok) throw providerError()

      let value: unknown
      try {
        value = await response.json()
      } catch (error) {
        throw providerError(error)
      }
      const parsed = DifyBlockingResponseSchema.safeParse(value)
      if (!parsed.success) throw providerError(parsed.error)

      const result = {
        answer: parsed.data.answer,
        conversationId: parsed.data.conversation_id,
        messageId: parsed.data.message_id,
        ...(parsed.data.created_at === undefined
          ? {}
          : {createdAt: new Date(parsed.data.created_at * 1000).toISOString()}),
      }
      return ChatMessageResponseSchema.parse(result)
    },
  }
}

export function difyChatPortFromEnv(environment: DifyEnvironment = process.env): ChatPort | undefined {
  const baseUrl = environment.DIFY_API_URL?.trim()
  const apiKey = environment.DIFY_API_KEY?.trim()
  return baseUrl && apiKey ? createDifyChatPort({baseUrl, apiKey}) : undefined
}
