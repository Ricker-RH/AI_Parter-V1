import {createConfiguredNeonAuth} from '../../../../lib/auth/server'

type Context = {params: Promise<{path: string[]}>}
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

async function dispatch(method: Method, request: Request, context: Context): Promise<Response> {
  const auth = createConfiguredNeonAuth()
  if (!auth) {
    return Response.json({code: 'AUTH_NOT_CONFIGURED'}, {
      status: 503,
      headers: {'cache-control': 'no-store, max-age=0'},
    })
  }
  return auth.handler()[method](request, context)
}

export const GET = (request: Request, context: Context) => dispatch('GET', request, context)
export const POST = (request: Request, context: Context) => dispatch('POST', request, context)
export const PUT = (request: Request, context: Context) => dispatch('PUT', request, context)
export const DELETE = (request: Request, context: Context) => dispatch('DELETE', request, context)
export const PATCH = (request: Request, context: Context) => dispatch('PATCH', request, context)
