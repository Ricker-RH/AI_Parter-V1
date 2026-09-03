import {
  ChannelDetailSchema,
  ChannelIpPageSchema,
  ChannelPageQuerySchema,
  ChannelPageSchema,
  ChannelPostPageSchema,
  ChannelQuerySchema,
  ChannelSlugSchema,
  type ChannelDetail,
  type ChannelIpPage,
  type ChannelPage,
  type FeedPage,
} from '@aifans/contracts'
import {fetchAifansApi} from './server-api'

export type ChannelsApiResult<T> =
  | {status: 'ok'; data: T}
  | {status: 'not-found'}
  | {status: 'unavailable'}

type Schema<T> = {safeParse(value: unknown): {success: true; data: T} | {success: false}}

async function request<T>(path: string, schema: Schema<T>, token?: string): Promise<ChannelsApiResult<T>> {
  try {
    const options = token
      ? {policy: 'private-cache' as const, getToken: async () => token}
      : {policy: 'public-cache' as const}
    const response = await fetchAifansApi(path, options)
    if (response.status === 404) return {status: 'not-found'}
    if (!response.ok) return {status: 'unavailable'}
    const parsed = schema.safeParse(await response.json())
    return parsed.success ? {status: 'ok', data: parsed.data} : {status: 'unavailable'}
  } catch {
    return {status: 'unavailable'}
  }
}

function slugPath(slug: string): string | null {
  const parsed = ChannelSlugSchema.safeParse(slug)
  return parsed.success ? `/v1/channels/${encodeURIComponent(parsed.data)}` : null
}

export function fetchChannels(input: {q?: string; limit?: number; cursor?: string}): Promise<ChannelsApiResult<ChannelPage>> {
  const parsed = ChannelQuerySchema.safeParse(input)
  if (!parsed.success) return Promise.resolve({status: 'unavailable'})
  const query = new URLSearchParams()
  if (parsed.data.q) query.set('q', parsed.data.q)
  if (input.limit !== undefined) query.set('limit', String(parsed.data.limit))
  if (parsed.data.cursor) query.set('cursor', parsed.data.cursor)
  return request(`/v1/channels${query.size ? `?${query}` : ''}`, ChannelPageSchema)
}

export function fetchChannel(slug: string): Promise<ChannelsApiResult<ChannelDetail>> {
  const path = slugPath(slug)
  return path ? request(path, ChannelDetailSchema) : Promise.resolve({status: 'not-found'})
}

function channelPagePath(slug: string, resource: 'profiles' | 'posts', input: {limit?: number; cursor?: string}): string | null {
  const base = slugPath(slug)
  const parsed = ChannelPageQuerySchema.safeParse(input)
  if (!base || !parsed.success) return null
  const query = new URLSearchParams()
  if (input.limit !== undefined) query.set('limit', String(parsed.data.limit))
  if (parsed.data.cursor) query.set('cursor', parsed.data.cursor)
  return `${base}/${resource}${query.size ? `?${query}` : ''}`
}

export function fetchChannelIps(slug: string, input: {limit?: number; cursor?: string} = {}): Promise<ChannelsApiResult<ChannelIpPage>> {
  const path = channelPagePath(slug, 'profiles', input)
  return path ? request(path, ChannelIpPageSchema) : Promise.resolve({status: 'unavailable'})
}

export function fetchChannelPosts(slug: string, input: {limit?: number; cursor?: string; token?: string} = {}): Promise<ChannelsApiResult<FeedPage>> {
  const path = channelPagePath(slug, 'posts', {...input.limit === undefined ? {} : {limit: input.limit}, ...input.cursor === undefined ? {} : {cursor: input.cursor}})
  return path ? request(path, ChannelPostPageSchema, input.token) : Promise.resolve({status: 'unavailable'})
}
