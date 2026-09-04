import {Hono} from 'hono'
import {expect,it,vi} from 'vitest'
import {registerRealtimeEphemeralRoutes} from './realtime-ephemeral.js'
import type {ApiVariables} from '../middleware/request-id.js'
it('requires internal credential and strictly rejects browser-selected recipients',async()=>{
 const app=new Hono<{Variables:ApiVariables}>(),emit=vi.fn(async()=>({deliveries:[]})),secret='s'.repeat(32)
 app.use('*',async(c,next)=>{c.set('requestId','ephemeral-test');await next()})
 registerRealtimeEphemeralRoutes(app,{realtimeEphemeral:{emit},realtimeInternalSecret:secret})
 const body={subject:'a',profileId:'11111111-1111-4111-8111-111111111111',sessionId:'11111111-1111-4111-8111-111111111111',conversationId:'11111111-1111-4111-8111-111111111111',type:'typing',isTyping:true}
 const post=(value:unknown,auth=true)=>app.request('/v1/internal/realtime/ephemeral',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:`Bearer ${secret}`}:{})},body:JSON.stringify(value)})
 expect((await post(body,false)).status).toBe(401)
 expect((await post({...body,recipientProfileId:body.profileId})).status).toBe(422)
 expect(emit).not.toHaveBeenCalled()
 expect((await post(body)).status).toBe(200);expect(emit).toHaveBeenCalledWith(body)
})
