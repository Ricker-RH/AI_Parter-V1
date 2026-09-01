import type {Hono} from 'hono'
import type {ApiVariables} from '../middleware/request-id.js'
import type {ReadinessPort} from '../ports/readiness.js'

export const registerHealthRoutes = (app: Hono<{Variables: ApiVariables}>,readiness?:ReadinessPort) => {
  app.get('/health', (c) => c.json({status: 'ok', service: 'aifans-api'}))
  app.get('/health/ready',async(c)=>{
    if(!readiness)return c.json({status:'unavailable'} as const,503)
    try{return await readiness.check()?c.json({status:'ok'} as const):c.json({status:'unavailable'} as const,503)}
    catch{return c.json({status:'unavailable'} as const,503)}
  })
}
