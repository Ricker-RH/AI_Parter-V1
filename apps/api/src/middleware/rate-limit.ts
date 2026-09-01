import {createHmac, timingSafeEqual} from 'node:crypto'
import type {MiddlewareHandler} from 'hono'
import {apiError} from '../errors.js'
import type {RateLimitPolicy,RateLimitPort} from '../ports/rate-limit.js'
import type {ApiVariables} from './request-id.js'

function policyFor(method:string,path:string):RateLimitPolicy|null {
  if(method==='POST'&&(path==='/v1/chat/conversations'||/^\/v1\/chat\/conversations\/[^/]+\/messages$/.test(path))) return 'chat_send'
  if(method==='POST'&&/^\/v1\/posts\/[^/]+\/comments$/.test(path)) return 'comment_create'
  if(['PUT','DELETE'].includes(method)&&(/^\/v1\/profiles\/[^/]+\/follow$/.test(path)||/^\/v1\/posts\/[^/]+\/(?:like|bookmark)$/.test(path)||/^\/v1\/notifications\/[^/]+\/read$/.test(path))) return 'social_mutation'
  if(['POST','PATCH','DELETE'].includes(method)&&path.startsWith('/v1/creator/')) return 'creator_mutation'
  if(['POST','PUT','PATCH','DELETE'].includes(method)&&path.startsWith('/v1/admin/')) return 'admin_mutation'
  if(['POST','PUT','PATCH','DELETE'].includes(method)&&path.startsWith('/v1/auth/')) return 'auth_attempt'
  return null
}

function verifiedClientHash(request: Request, secret: string): string | null {
  const value = request.headers.get('x-aifans-rate-limit-identity')
  const match = value?.match(/^v1\.(\d+)\.([a-f0-9]{64})\.([a-f0-9]{64})$/)
  if (!match) return null
  const [, minuteText, clientHash, signature] = match
  if (!minuteText || !clientHash || !signature) return null
  const minute = Number(minuteText)
  const currentMinute = Math.floor(Date.now() / 60_000)
  if (!Number.isSafeInteger(minute) || (minute !== currentMinute && minute !== currentMinute - 1)) return null
  const unsigned = `v1.${minute}.${clientHash}`
  const expected = createHmac('sha256', secret).update(unsigned).digest('hex')
  const actualBytes = Buffer.from(signature, 'hex')
  const expectedBytes = Buffer.from(expected, 'hex')
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null
  return clientHash
}

export function rateLimitMiddleware(options:{port?:RateLimitPort;hmacSecret?:string;identitySecret?:string;required:boolean}):MiddlewareHandler<{Variables:ApiVariables}>{
  return async(c,next)=>{
    const policy=policyFor(c.req.method,new URL(c.req.url).pathname)
    if(!policy) return next()
    if(!options.port||!options.hmacSecret) {
      if(options.required) return apiError(c,503,'RATE_LIMIT_NOT_CONFIGURED','Rate limiting is not configured')
      return next()
    }
    if (!options.identitySecret) {
      if (options.required) return apiError(c,503,'RATE_LIMIT_IDENTITY_UNAVAILABLE','Rate limit identity is unavailable')
      return next()
    }
    const clientHash = verifiedClientHash(c.req.raw, options.identitySecret)
    if (!clientHash) return apiError(c,503,'RATE_LIMIT_IDENTITY_UNAVAILABLE','Rate limit identity is unavailable')
    const identifierHash=createHmac('sha256',options.hmacSecret).update(clientHash).digest('hex')
    let decision
    try {decision=await options.port.consume({policy,identifierHash})}
    catch {return apiError(c,503,'RATE_LIMIT_UNAVAILABLE','Rate limiting is unavailable')}
    if(!decision.allowed){c.header('Retry-After',String(Math.max(1,decision.retryAfterSeconds)));return apiError(c,429,'RATE_LIMITED','Too many requests')}
    return next()
  }
}
