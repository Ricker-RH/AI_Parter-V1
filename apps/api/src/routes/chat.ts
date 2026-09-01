import {
  ChatConversationCreateInputSchema,
  ChatConversationPageSchema,
  ChatConversationSummarySchema,
  ChatHistoryPageSchema,
  ChatSendInputSchema,
  ChatSendResponseSchema,
  ChatStreamEventSchema,
  MAX_CHAT_CURSOR_LENGTH,
  decodeChatConversationCursor,
  decodeChatMessageCursor,
  type ChatStreamEvent,
} from '@aifans/contracts'
import type {Context, Hono} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import {
  MAX_PROVIDER_ANSWER_LENGTH,
  ProviderChatDeltaSchema,
  ProviderChatResultSchema,
  type ChatPort,
} from '../ports/chat.js'
import type {ChatRepositoryPort} from '../ports/chat-repository.js'
import type {ChatTargetPort} from '../ports/chat-target.js'
import type {ProfilePort} from '../ports/profiles.js'

export type ChatDependencies = {
  auth?: AuthVerifier
  profiles?: ProfilePort
  chat?: ChatPort
  chatTargets?: ChatTargetPort
  conversations?: ChatRepositoryPort
  onUnhandledError?: (diagnostic: {name: string; code?: string; requestId?: string; conversationId?: string}) => void
}

type ApiContext = Context<{Variables: ApiVariables}>
type HumanResolution =
  | {ok: true; actor: {subject: string}; humanProfileId: string; preferredLocale: 'en' | 'zh-CN'}
  | {ok: false; response: Response}

const EmptyQuerySchema = z.strictObject({})
const CursorSchema = z.string().min(1).max(MAX_CHAT_CURSOR_LENGTH).regex(/^[A-Za-z0-9_-]+$/)
const LimitSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().min(1).max(100))
const ConversationQuerySchema = z.strictObject({limit: LimitSchema.optional(), cursor: CursorSchema.optional()})
const ConversationIdSchema = z.uuid()

function safeQuery(c: ApiContext): Record<string, string> | null {
  const values: Array<[string, string]> = []
  const keys = new Set<string>()
  for (const entry of new URL(c.req.url).searchParams.entries()) {
    if (keys.has(entry[0])) return null
    keys.add(entry[0])
    values.push(entry)
  }
  return Object.fromEntries(values)
}

function stringEnd(text: string, start: number): number {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1
    else if (text[index] === '"') return index + 1
  }
  return -1
}

function valueEnd(text: string, start: number): number {
  let quoted = false
  let escaped = false
  let depth = 0
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') quoted = true
    else if (character === '{' || character === '[') depth += 1
    else if (character === '}' || character === ']') {
      if (depth === 0) return index
      depth -= 1
    } else if (character === ',' && depth === 0) return index
  }
  return text.length
}

function hasDuplicateRootKeys(text: string): boolean {
  let index = 1
  const keys = new Set<string>()
  while (index < text.length) {
    while (/\s/.test(text[index] ?? '')) index += 1
    if (text[index] === '}') return false
    if (text[index] !== '"') return false
    const end = stringEnd(text, index)
    if (end < 0) return false
    const key = JSON.parse(text.slice(index, end)) as string
    if (keys.has(key)) return true
    keys.add(key)
    index = end
    while (/\s/.test(text[index] ?? '')) index += 1
    if (text[index] !== ':') return false
    index = valueEnd(text, index + 1)
    if (text[index] === ',') index += 1
  }
  return false
}

async function strictBody<T>(c: ApiContext, schema: z.ZodType<T>): Promise<T | null> {
  const text = await c.req.text()
  try {
    const json: unknown = JSON.parse(text)
    if (typeof json !== 'object' || json === null || Array.isArray(json) || hasDuplicateRootKeys(text.trim())) return null
    const parsed = schema.safeParse(json)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function requireHuman(c: ApiContext, dependencies: ChatDependencies): Promise<HumanResolution> {
  if (!dependencies.auth) return {ok: false, response: apiError(c, 503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured')}
  const result = await dependencies.auth.verify(c.req.raw)
  if (result.status === 'missing') return {ok: false, response: apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required')}
  if (result.status === 'invalid' || !result.identity.subject.trim()) return {ok: false, response: apiError(c, 401, 'AUTH_INVALID', 'Authentication is invalid')}
  if (!dependencies.profiles) return {ok: false, response: apiError(c, 503, 'PROFILE_NOT_CONFIGURED', 'Profiles are not configured')}
  await dependencies.profiles.ensureHumanProfile({
    authSubject: result.identity.subject,
    ...(result.identity.email === undefined ? {} : {email: result.identity.email}),
    ...(result.identity.displayName === undefined ? {} : {displayName: result.identity.displayName}),
  })
  const account = await dependencies.profiles.getCurrentAccount({subject: result.identity.subject})
  if (account === null) return {ok: false, response: apiError(c, 500, 'PROFILE_NOT_AVAILABLE', 'Profile is not available')}
  if (account.kind !== 'human') return {ok: false, response: apiError(c, 403, 'HUMAN_REQUIRED', 'A human account is required')}
  return {ok: true, actor: {subject: result.identity.subject}, humanProfileId: account.id, preferredLocale: account.preferredLocale}
}

function invalidRequest(c: ApiContext, status: 400 | 422) {
  return apiError(c, status, 'INVALID_REQUEST', 'Request is invalid')
}

function parseQuery(c: ApiContext, decodeCursor: (cursor: string) => unknown) {
  const query = safeQuery(c)
  if (query === null) return null
  const parsed = ConversationQuerySchema.safeParse(query)
  if (!parsed.success) return null
  if (parsed.data.cursor !== undefined) {
    try { decodeCursor(parsed.data.cursor) } catch { return null }
  }
  return parsed.data
}

function storage(c: ApiContext, dependencies: ChatDependencies): ChatRepositoryPort | Response {
  return dependencies.conversations ?? apiError(c, 503, 'CHAT_STORAGE_NOT_CONFIGURED', 'Chat storage is not configured')
}

const encoder = new TextEncoder()
function frame(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`)
}

function streamResponse(c: ApiContext, events: ChatStreamEvent[]): Response {
  return c.body(events.map((event) => `data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`).join(''), 200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache/no-transform',
  })
}

function interrupted(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Chat stream interrupted', 'AbortError')
}

function nextWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Chat stream interrupted', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      cleanup()
      reject(new DOMException('Chat stream interrupted', 'AbortError'))
    }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, {once: true})
    operation.then(
      (value) => { cleanup(); resolve(value) },
      (error: unknown) => { cleanup(); reject(error) },
    )
  })
}

async function persistFailure(repository: ChatRepositoryPort, actor: {subject: string}, conversationId: string, humanMessageId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (await repository.failHumanMessage(actor, {conversationId, humanMessageId})) return true
    } catch {
      // Retry a bounded number of times before surfacing a safe stream error.
    }
  }
  return false
}

export function registerChatRoutes(app: Hono<{Variables: ApiVariables}>, dependencies: ChatDependencies) {
  app.get('/v1/chat/conversations', async (c) => {
    const human = await requireHuman(c, dependencies)
    if (!human.ok) return human.response
    const query = parseQuery(c, decodeChatConversationCursor)
    if (!query) return invalidRequest(c, 400)
    const repository = storage(c, dependencies)
    if (repository instanceof Response) return repository
    return c.json(ChatConversationPageSchema.parse(await repository.listConversations(human.actor, {
      limit: query.limit ?? 20,
      ...(query.cursor === undefined ? {} : {cursor: query.cursor}),
      sendEnabled: Boolean(dependencies.chat),
    })))
  })

  app.post('/v1/chat/conversations', async (c) => {
    const human = await requireHuman(c, dependencies)
    if (!human.ok) return human.response
    const query = safeQuery(c)
    if (query === null || !EmptyQuerySchema.safeParse(query).success) return invalidRequest(c, 400)
    const body = await strictBody(c, ChatConversationCreateInputSchema)
    if (!body) return invalidRequest(c, 422)
    const repository = storage(c, dependencies)
    if (repository instanceof Response) return repository
    if (!dependencies.chatTargets) return apiError(c, 503, 'CHAT_TARGET_NOT_CONFIGURED', 'Chat targets are not configured')
    if (!await dependencies.chatTargets.isPublicChatIp(human.actor, body.ipProfileId)) return apiError(c, 404, 'CHAT_TARGET_NOT_FOUND', 'Chat target was not found')
    const conversation = await repository.getOrCreateConversation(human.actor, {
      humanProfileId: human.humanProfileId,
      ipProfileId: body.ipProfileId,
      sendEnabled: Boolean(dependencies.chat),
    })
    if (!conversation) return apiError(c, 404, 'CHAT_TARGET_NOT_FOUND', 'Chat target was not found')
    // get-or-create is idempotent; the repository does not distinguish created from reused.
    return c.json(ChatConversationSummarySchema.parse(conversation))
  })

  app.get('/v1/chat/conversations/:conversationId/messages', async (c) => {
    const human = await requireHuman(c, dependencies)
    if (!human.ok) return human.response
    const id = ConversationIdSchema.safeParse(c.req.param('conversationId'))
    const query = parseQuery(c, decodeChatMessageCursor)
    if (!id.success || !query) return invalidRequest(c, 400)
    const repository = storage(c, dependencies)
    if (repository instanceof Response) return repository
    const history = await repository.listMessages(human.actor, {
      conversationId: id.data,
      limit: query.limit ?? 50,
      ...(query.cursor === undefined ? {} : {cursor: query.cursor}),
      sendEnabled: Boolean(dependencies.chat),
    })
    if (!history) return apiError(c, 404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversation was not found')
    return c.json(ChatHistoryPageSchema.parse(history))
  })

  app.post('/v1/chat/conversations/:conversationId/messages', async (c) => {
    const human = await requireHuman(c, dependencies)
    if (!human.ok) return human.response
    const query = safeQuery(c)
    const id = ConversationIdSchema.safeParse(c.req.param('conversationId'))
    if (!id.success || query === null || !EmptyQuerySchema.safeParse(query).success) return invalidRequest(c, 400)
    const body = await strictBody(c, ChatSendInputSchema)
    if (!body) return invalidRequest(c, 422)
    const repository = storage(c, dependencies)
    if (repository instanceof Response) return repository
    const provider = dependencies.chat
    if (!provider) return apiError(c, 503, 'CHAT_NOT_CONFIGURED', 'Chat is not configured')
    const begun = await repository.beginHumanMessage(human.actor, {conversationId: id.data, requestId: body.requestId, body: body.message})
    if (!begun) return apiError(c, 404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversation was not found')
    if (begun.type === 'conflict') return apiError(c, 409, 'CHAT_REQUEST_CONFLICT', 'Request ID conflicts with an existing message')
    if (begun.type === 'inflight') return apiError(c, 409, 'CHAT_IN_PROGRESS', 'Chat request is already in progress')
    if (begun.type === 'complete') {
      const replay = ChatSendResponseSchema.parse(begun.response)
      if (!replay.assistantMessage) throw new Error('CHAT_COMPLETION_MISSING')
      return streamResponse(c, [{type: 'human_message', message: replay.humanMessage}, {type: 'assistant_complete', message: replay.assistantMessage}])
    }

    const abortController = new AbortController()
    const requestSignal = c.req.raw.signal
    const abortFromRequest = () => abortController.abort(requestSignal.reason)
    if (requestSignal.aborted) abortFromRequest()
    else requestSignal.addEventListener('abort', abortFromRequest, {once: true})
    const signal = abortController.signal
    let closed = false
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const emit = (event: ChatStreamEvent) => { if (!closed) controller.enqueue(frame(event)) }
        void (async () => {
          let iterator: AsyncGenerator<unknown, unknown> | undefined
          let completed = false
          try {
            emit({type: 'human_message', message: begun.humanMessage})
            iterator = provider.streamMessage({
              humanProfileId: begun.humanProfileId,
              ipProfileId: begun.ipProfileId,
              message: body.message,
              ...(begun.providerConversationId === undefined ? {} : {providerConversationId: begun.providerConversationId}),
              locale: body.locale ?? human.preferredLocale,
              requestId: c.get('requestId'),
              signal,
            })
            let providerResult: unknown
            let answer = ''
            while (true) {
              const next = await nextWithAbort(iterator.next(), signal)
              throwIfAborted(signal)
              if (next.done) { providerResult = next.value; break }
              const delta = ProviderChatDeltaSchema.parse(next.value)
              if (answer.length + delta.delta.length > MAX_PROVIDER_ANSWER_LENGTH) throw new Error('CHAT_PROVIDER_ANSWER_TOO_LONG')
              answer += delta.delta
              throwIfAborted(signal)
              emit({type: 'assistant_delta', delta: delta.delta})
            }
            const result = ProviderChatResultSchema.parse(providerResult)
            if (result.answer !== answer) throw new Error('CHAT_PROVIDER_ANSWER_MISMATCH')
            throwIfAborted(signal)
            const persisted = await repository.completeProviderReply(human.actor, {
              conversationId: id.data,
              humanMessageId: begun.humanMessage.id,
              answer: result.answer,
              providerConversationId: result.providerConversationId,
              providerMessageId: result.providerMessageId,
            })
            if (!persisted?.assistantMessage) throw new Error('CHAT_COMPLETION_FAILED')
            completed = true
            emit({type: 'assistant_complete', message: persisted.assistantMessage})
          } catch (error) {
            if (!completed && !await persistFailure(repository, human.actor, id.data, begun.humanMessage.id)) {
              try {
                dependencies.onUnhandledError?.({
                  name: 'ChatFailurePersistenceError',
                  code: 'CHAT_FAILURE_PERSISTENCE_FAILED',
                  requestId: c.get('requestId'),
                  conversationId: id.data,
                })
              } catch {
                // Diagnostics must never replace the fixed safe stream error.
              }
              // Bounded retries recover transient failures; long outages require external reconciliation.
              if (!closed) {
                closed = true
                controller.error(new Error('Chat failure persistence failed'))
              }
              return
            }
            emit({type: 'failed', code: interrupted(error, signal) ? 'CHAT_INTERRUPTED' : 'CHAT_PROVIDER_ERROR'})
          } finally {
            requestSignal.removeEventListener('abort', abortFromRequest)
            if (!completed && iterator) {
              void iterator.return(undefined).catch(() => undefined)
            }
            if (!closed) { closed = true; controller.close() }
          }
        })()
      },
      cancel(reason) { closed = true; abortController.abort(reason) },
    })
    return c.body(responseStream, 200, {'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache/no-transform'})
  })
}
