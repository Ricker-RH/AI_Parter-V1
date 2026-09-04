import {expect,it,vi} from 'vitest'
import {Hono} from 'hono'
import {registerHumanSocialRoutes} from './human-social.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {HumanSocialPort} from '../ports/human-social.js'
const id='11111111-1111-4111-8111-111111111111'
it('requires verified human identity and rejects duplicates, oversized batches and forged subjects',async()=>{
 const getRelationships=vi.fn(async()=>({items:[]}));let authenticated=false
 const app=new Hono<{Variables:ApiVariables}>();app.use('*',async(c,next)=>{c.set('requestId','batch-test');await next()})
 registerHumanSocialRoutes(app,{auth:{verify:async()=>authenticated?{status:'authenticated',identity:{subject:'verified'}}:{status:'missing'}},profiles:{getCurrentAccount:async()=>({kind:'human',id})} as never,humanSocial:{getRelationships} as unknown as HumanSocialPort})
 const post=(body:unknown)=>app.request('/v1/human-relationships',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
 expect((await post({profileIds:[id]})).status).toBe(401);authenticated=true
 for(const body of [{profileIds:[id,id]},{profileIds:Array(51).fill(id)},{profileIds:[id],subject:'spoof'},{profileIds:['bad']}])expect((await post(body)).status).toBe(400)
 expect(getRelationships).not.toHaveBeenCalled()
 expect((await post({profileIds:[id]})).status).toBe(200)
 expect(getRelationships).toHaveBeenCalledWith({subject:'verified'},[id])
});
