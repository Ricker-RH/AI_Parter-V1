import type {Context} from 'hono'
import type {z} from 'zod'
import type {ApiVariables} from '../middleware/request-id.js'

type ApiContext = Context<{Variables: ApiVariables}>

function skipWhitespace(text: string, index: number): number {
  while (/\s/.test(text[index] ?? '')) index += 1
  return index
}

function stringEnd(text: string, start: number): number {
  if (text[start] !== '"') throw new Error('invalid JSON string')
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1
    else if (text[index] === '"') return index + 1
  }
  throw new Error('unterminated JSON string')
}

function scalarEnd(text: string, start: number): number {
  let index = start
  while (index < text.length && !/[\s,}\]]/.test(text[index]!)) index += 1
  if (index === start) throw new Error('invalid JSON scalar')
  return index
}

function valueEnd(text: string, start: number, duplicate: {found: boolean}): number {
  let index = skipWhitespace(text, start)
  if (text[index] === '"') return stringEnd(text, index)
  if (text[index] === '[') {
    index = skipWhitespace(text, index + 1)
    if (text[index] === ']') return index + 1
    while (index < text.length) {
      index = skipWhitespace(text, valueEnd(text, index, duplicate))
      if (text[index] === ']') return index + 1
      if (text[index] !== ',') throw new Error('invalid JSON array')
      index = skipWhitespace(text, index + 1)
    }
    throw new Error('unterminated JSON array')
  }
  if (text[index] === '{') {
    const keys = new Set<string>()
    index = skipWhitespace(text, index + 1)
    if (text[index] === '}') return index + 1
    while (index < text.length) {
      const end = stringEnd(text, index)
      const key = JSON.parse(text.slice(index, end)) as string
      if (keys.has(key)) duplicate.found = true
      keys.add(key)
      index = skipWhitespace(text, end)
      if (text[index] !== ':') throw new Error('invalid JSON object')
      index = skipWhitespace(text, valueEnd(text, index + 1, duplicate))
      if (text[index] === '}') return index + 1
      if (text[index] !== ',') throw new Error('invalid JSON object')
      index = skipWhitespace(text, index + 1)
    }
    throw new Error('unterminated JSON object')
  }
  return scalarEnd(text, index)
}

export async function strictJsonBody<T>(c: ApiContext, schema: z.ZodType<T>): Promise<T | null> {
  const text = await c.req.text()
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const duplicate = {found: false}
    const end = skipWhitespace(text, valueEnd(text, 0, duplicate))
    if (end !== text.length || duplicate.found) return null
    const result = schema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function strictQuery<T>(c: ApiContext, schema: z.ZodType<T>): T | null {
  const entries: Array<[string, string]> = []
  const keys = new Set<string>()
  for (const entry of new URL(c.req.url).searchParams.entries()) {
    if (keys.has(entry[0])) return null
    keys.add(entry[0])
    entries.push(entry)
  }
  const result = schema.safeParse(Object.fromEntries(entries))
  return result.success ? result.data : null
}
