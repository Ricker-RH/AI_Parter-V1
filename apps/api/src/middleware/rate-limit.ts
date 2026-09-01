import {createHmac} from 'node:crypto'
import {isIP} from 'node:net'
import type {MiddlewareHandler} from 'hono'
import {apiError} from '../errors.js'
import type {RateLimitPolicy,RateLimitPort} from '../ports/rate-limit.js'
import type {ApiVariables} from './request-id.js'

function policyFor(method:string,path:string):RateLimitPolicy|null {
  if(method==='POST'&&/^\/v1\/chat\/[^/]+\/messages$/.test(path)) return 'chat_send'
  if(method==='POST'&&/^\/v1\/posts\/[^/]+\/comments$/.test(path)) return 'comment_create'
  if(['PUT','DELETE'].includes(method)&&(/^\/v1\/profiles\/[^/]+\/follow$/.test(path)||/^\/v1\/posts\/[^/]+\/(?:like|bookmark)$/.test(path)||/^\/v1\/notifications\/[^/]+\/read$/.test(path))) return 'social_mutation'
  if(['POST','PATCH','DELETE'].includes(method)&&path.startsWith('/v1/creator/')) return 'creator_mutation'
  if(['POST','PUT','PATCH','DELETE'].includes(method)&&path.startsWith('/v1/admin/')) return 'admin_mutation'
  if(['POST','PUT','PATCH','DELETE'].includes(method)&&path.startsWith('/v1/auth/')) return 'auth_attempt'
  return null
}

function clientIdentifier(request:Request):string {
  for(const name of ['x-vercel-forwarded-for','x-forwarded-for']){
    const first=request.headers.get(name)?.split(',')[0]?.trim()
    if(first&&isIP(first)) return first
  }
  return 'unavailable'
}

export function rateLimitMiddleware(options:{port?:RateLimitPort;hmacSecret?:string;required:boolean}):MiddlewareHandler<{Variables:ApiVariables}>{
  return async(c,next)=>{
    const policy=policyFor(c.req.method,new URL(c.req.url).pathname)
    if(!policy) return next()
    if(!options.port||!options.hmacSecret) {
      if(options.required) return apiError(c,503,'RATE_LIMIT_NOT_CONFIGURED','Rate limiting is not configured')
      return next()
    }
    const identifierHash=createHmac('sha256',options.hmacSecret).update(clientIdentifier(c.req.raw)).digest('hex')
    let decision
    try {decision=await options.port.consume({policy,identifierHash})}
    catch {return apiError(c,503,'RATE_LIMIT_UNAVAILABLE','Rate limiting is unavailable')}
    if(!decision.allowed){c.header('Retry-After',String(Math.max(1,decision.retryAfterSeconds)));return apiError(c,429,'RATE_LIMITED','Too many requests')}
    return next()
  }
}
