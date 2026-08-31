import {ChatMessageInputSchema, ChatMessageResponseSchema} from '@aifans/contracts'
import type {Context, Hono} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import {ChatProviderError, type ChatPort} from '../ports/chat.js'
import type {ProfilePort} from '../ports/profiles.js'

export type ChatDependencies = {
  auth?: AuthVerifier
  profiles?: ProfilePort
  chat?: ChatPort
}

type ApiContext = Context<{Variables: ApiVariables}>
type HumanResolution =
  | {ok: true; humanProfileId: string; preferredLocale: 'en' | 'zh-CN'}
  | {ok: false; response: Response}

const EmptyQuerySchema = z.strictObject({})
const IdSchema = z.uuid()

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

async function strictBody(c: ApiContext) {
  const text = await c.req.text()
  try {
    const json: unknown = JSON.parse(text)
    if (typeof json !== 'object' || json === null || Array.isArray(json) || hasDuplicateRootKeys(text.trim())) return null
    const parsed = ChatMessageInputSchema.safeParse(json)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function requireHuman(c: ApiContext, dependencies: ChatDependencies): Promise<HumanResolution> {
  if (!dependencies.auth) {
    return {ok: false, response: apiError(c, 503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured')}
  }
  const result = await dependencies.auth.verify(c.req.raw)
  if (result.status === 'missing') {
    return {ok: false, response: apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required')}
  }
  if (result.status === 'invalid' || !result.identity.subject.trim()) {
    return {ok: false, response: apiError(c, 401, 'AUTH_INVALID', 'Authentication is invalid')}
  }
  if (!dependencies.profiles) {
    return {ok: false, response: apiError(c, 503, 'PROFILE_NOT_CONFIGURED', 'Profiles are not configured')}
  }

  await dependencies.profiles.ensureHumanProfile({
    authSubject: result.identity.subject,
    ...(result.identity.email === undefined ? {} : {email: result.identity.email}),
    ...(result.identity.displayName === undefined ? {} : {displayName: result.identity.displayName}),
  })
  const account = await dependencies.profiles.getCurrentAccount({subject: result.identity.subject})
  if (account === null) {
    return {ok: false, response: apiError(c, 500, 'PROFILE_NOT_AVAILABLE', 'Profile is not available')}
  }
  if (account.kind !== 'human') {
    return {ok: false, response: apiError(c, 403, 'HUMAN_REQUIRED', 'A human account is required')}
  }
  return {ok: true, humanProfileId: account.id, preferredLocale: account.preferredLocale}
}

export function registerChatRoutes(app: Hono<{Variables: ApiVariables}>, dependencies: ChatDependencies) {
  app.post('/v1/chat/:ipProfileId/messages', async (c) => {
    const query = safeQuery(c)
    if (query === null || !EmptyQuerySchema.safeParse(query).success) {
      return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    }
    const ipProfileId = IdSchema.safeParse(c.req.param('ipProfileId'))
    if (!ipProfileId.success) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const body = await strictBody(c)
    if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    if (!dependencies.chat) {
      return apiError(c, 503, 'CHAT_NOT_CONFIGURED', 'Chat is not configured')
    }

    try {
      const human = await requireHuman(c, dependencies)
      if (!human.ok) return human.response
      const response = await dependencies.chat.sendMessage({
        humanProfileId: human.humanProfileId,
        ipProfileId: ipProfileId.data,
        message: body.message,
        ...(body.conversationId === undefined ? {} : {conversationId: body.conversationId}),
        locale: body.locale ?? human.preferredLocale,
        requestId: c.get('requestId'),
      })
      return c.json(ChatMessageResponseSchema.parse(response), body.conversationId ? 200 : 201)
    } catch (error) {
      if (error instanceof ChatProviderError) {
        return apiError(c, 502, 'CHAT_PROVIDER_ERROR', 'Chat provider is unavailable')
      }
      throw error
    }
  })
}
