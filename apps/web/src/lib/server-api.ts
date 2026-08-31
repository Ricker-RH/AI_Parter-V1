type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

async function defaultToken(): Promise<string | null> {
  const {getApiBearerToken} = await import('./auth/server')
  return getApiBearerToken()
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

function outboundHeaders(input: HeadersInit | undefined, token: string | null): Headers {
  const incoming = new Headers(input)
  const headers = new Headers()
  for (const name of ['content-type', 'x-request-id']) {
    const value = incoming.get(name)
    if (value) headers.set(name, value)
  }
  if (token) headers.set('authorization', `Bearer ${token}`)
  return headers
}

export async function fetchAifansApi(
  path: string,
  {
    fetcher = fetch,
    getToken = defaultToken,
    requestInit = {},
  }: {fetcher?: Fetcher; getToken?: () => Promise<string | null>; requestInit?: RequestInit} = {},
): Promise<Response> {
  if (!safePath(path)) throw new Error('Invalid API path')
  const baseUrl = readApiBaseUrl()
  if (!baseUrl) throw new Error('AIFANS API is not configured')
  const token = await getToken()
  return fetcher(`${baseUrl}${path}`, {
    ...requestInit,
    cache: 'no-store',
    headers: Object.fromEntries(outboundHeaders(requestInit.headers, token)),
  })
}
