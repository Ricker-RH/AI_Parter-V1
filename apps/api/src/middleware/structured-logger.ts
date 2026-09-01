import type {MiddlewareHandler} from 'hono'
import type {ApiVariables} from './request-id.js'
import type {StructuredLogger} from '../ports/logger.js'

export function structuredLoggerMiddleware(logger:StructuredLogger):MiddlewareHandler<{Variables:ApiVariables}>{
  return async(c,next)=>{
    const started=performance.now()
    await next()
    const record={event:'http_request' as const,requestId:c.get('requestId'),method:c.req.method,route:new URL(c.req.url).pathname,status:c.res.status,durationMs:Math.max(0,Math.round(performance.now()-started))}
    if(c.res.status>=500) logger.error(record); else logger.info(record)
  }
}
