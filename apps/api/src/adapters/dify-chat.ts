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

const DifyBlockingResponseSchema = z.strictObject({
  event: z.literal('message'),
  task_id: z.uuid(),
  id: z.uuid(),
  mode: z.enum(['chat', 'agent-chat', 'advanced-chat']),
  answer: z.string(),
  conversation_id: z.uuid(),
  message_id: z.uuid(),
  metadata: z.object({}).passthrough(),
  created_at: z.number().int().min(0).max(8_640_000_000_000),
})

function providerError(cause?: unknown): ChatProviderError {
  return new ChatProviderError(cause)
}

export function createDifyChatPort({baseUrl, apiKey, fetcher = fetch}: DifyChatOptions): ChatPort {
  const endpoint = new URL(`${baseUrl.replace(/\/+$/, '')}/chat-messages`).toString()

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
      try {
        const parsed = DifyBlockingResponseSchema.parse(value)
        return ChatMessageResponseSchema.parse({
          answer: parsed.answer,
          conversationId: parsed.conversation_id,
          messageId: parsed.message_id,
          createdAt: new Date(parsed.created_at * 1000).toISOString(),
        })
      } catch (error) {
        throw providerError(error)
      }
    },
  }
}

export function difyChatPortFromEnv(environment: DifyEnvironment = process.env): ChatPort | undefined {
  const baseUrl = environment.DIFY_API_URL?.trim()
  const apiKey = environment.DIFY_API_KEY?.trim()
  return baseUrl && apiKey ? createDifyChatPort({baseUrl, apiKey}) : undefined
}
