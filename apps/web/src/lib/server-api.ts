type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
import {getVercelOidcToken} from '@vercel/oidc'
import {createRateLimitIdentity} from './rate-limit-identity'

type SharedRequestOptions = {
  fetcher?: Fetcher
  requestInit?: RequestInit
  timeoutMs?: number
}

export type AifansApiRequestOptions =
  | (SharedRequestOptions & {policy: 'public-cache'; getToken?: never; trustedClientHeaders?: never; trustedIdempotencyKey?: never})
  | (SharedRequestOptions & {policy: 'private-cache'; getToken?: () => Promise<string | null>; trustedClientHeaders?: Headers; trustedIdempotencyKey?: never})
  | (SharedRequestOptions & {policy: 'live-no-store'; getToken?: () => Promise<string | null>; trustedClientHeaders?: Headers; trustedIdempotencyKey?: string})

async function defaultToken(): Promise<string | null> {
  const {getApiBearerToken} = await import('./auth/server')
  return getApiBearerToken()
}

async function vercelOidcToken(): Promise<string | null> {
  if (process.env.VERCEL !== '1') return null
  try {
    const token = await getVercelOidcToken()
    if (!token) throw new Error('Vercel returned an empty OIDC token')
    return token
  } catch (cause) {
    throw new Error('Failed to acquire Vercel OIDC token', {cause})
  }
}

function invokeProvider<T>(provider: () => T | PromiseLike<T>): Promise<Awaited<T>> {
  try {
    return Promise.resolve(provider())
  } catch (cause) {
    return Promise.reject(cause)
  }
}

export function readApiBaseUrl(): string | null {
  const configured = process.env.AIFANS_API_URL?.trim()
  if (!configured) return null
  try {
    const url = new URL(configured)
    const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    if (url.protocol !== 'https:' && !localHttp) return null
    return configured.replace(/\/+$/, '')
  } catch {
    return null
  }
}

function safePath(path: string): boolean {
  return (path === '/health' || path.startsWith('/v1/')) && !path.startsWith('//')
}

function outboundHeaders(input: HeadersInit | undefined, token: string | null, oidcToken: string | null, trustedClientHeaders?: Headers, trustedIdempotencyKey?: string): Headers {
  const incoming = new Headers(input)
  const headers = new Headers()
  for (const name of ['content-type', 'x-request-id']) {
    const value = incoming.get(name)
    if (value) headers.set(name, value)
  }
  if (token) headers.set('authorization', `Bearer ${token}`)
  const identity = trustedClientHeaders && createRateLimitIdentity(trustedClientHeaders, Date.now(), process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET)
  if (identity) headers.set('x-aifans-rate-limit-identity', identity)
  if (trustedIdempotencyKey) headers.set('idempotency-key', trustedIdempotencyKey)
  if (oidcToken) headers.set('x-vercel-trusted-oidc-idp-token', oidcToken)
  return headers
}

export async function fetchAifansApi(
  path: string,
  options: AifansApiRequestOptions,
): Promise<Response> {
  if (!options || !['public-cache', 'private-cache', 'live-no-store'].includes(options.policy)) throw new Error('Explicit API request policy required')
  if (!safePath(path)) throw new Error('Invalid API path')
  if (options.policy === 'public-cache' && ('getToken' in options || 'trustedClientHeaders' in options)) throw new Error('Public API cache cannot use authentication')
  if (options.policy !== 'live-no-store' && 'trustedIdempotencyKey' in options) throw new Error('Trusted idempotency keys require a live request')
  const trustedIdempotencyKey = options.policy === 'live-no-store' ? options.trustedIdempotencyKey : undefined
  if (trustedIdempotencyKey !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trustedIdempotencyKey)) throw new Error('Invalid trusted idempotency key')
  const fetcher = options.fetcher ?? fetch
  const requestInit = options.requestInit ?? {}
  const timeoutMs = options.timeoutMs ?? 8000
  const trustedClientHeaders = options.policy === 'public-cache' ? undefined : options.trustedClientHeaders
  const getToken = options.policy === 'public-cache' ? async () => null : (options.getToken ?? defaultToken)
  const method = (requestInit.method ?? 'GET').toUpperCase()
  if (options.policy === 'public-cache' && method !== 'GET' && method !== 'HEAD') throw new Error('Public API cache only supports reads')
  const baseUrl = readApiBaseUrl()
  if (!baseUrl) throw new Error('AIFANS API is not configured')
  const controller=new AbortController()
  if(requestInit.signal?.aborted) controller.abort(requestInit.signal.reason)
  const onAbort=()=>controller.abort(requestInit.signal?.reason)
  requestInit.signal?.addEventListener('abort',onAbort,{once:true})
  const timer=setTimeout(()=>controller.abort(new Error('AIFANS API timeout')),timeoutMs)
  try {
    const timeout=new Promise<never>((_resolve,reject)=>{const rejectOnAbort=()=>reject(controller.signal.reason??new Error('AIFANS API timeout'));if(controller.signal.aborted)rejectOnAbort();else controller.signal.addEventListener('abort',rejectOnAbort,{once:true})})
    const oidcTokenPromise=invokeProvider(vercelOidcToken)
    const bearerTokenPromise=invokeProvider(getToken)
    const [oidcToken,token]=await Promise.race([Promise.all([oidcTokenPromise,bearerTokenPromise]),timeout])
    return await fetcher(`${baseUrl}${path}`, {...requestInit,...(options.policy === 'public-cache' ? {} : {cache: 'no-store' as const}),headers:Object.fromEntries(outboundHeaders(requestInit.headers,token,oidcToken,trustedClientHeaders,trustedIdempotencyKey)),signal:controller.signal})
  } finally {
    clearTimeout(timer)
    requestInit.signal?.removeEventListener('abort',onAbort)
  }
}
