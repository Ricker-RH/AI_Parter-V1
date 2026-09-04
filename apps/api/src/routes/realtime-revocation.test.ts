import {Hono} from 'hono'
import {expect,it,vi} from 'vitest'
import {registerRealtimeRevocationRoutes} from './realtime-revocation.js'
import type {ApiVariables} from '../middleware/request-id.js'
it('requires a verified human and rejects forged identity before revoking own sessions',async()=>{
 const app=new Hono<{Variables:ApiVariables}>();app.use('*',async(c,next)=>{c.set('requestId','revoke-test');await next()})
 let signedIn=false;const revokeOwn=vi.fn(async()=>2)
 registerRealtimeRevocationRoutes(app,{auth:{verify:async()=>signedIn?{status:'authenticated',identity:{subject:'verified'}}:{status:'missing'}},profiles:{getCurrentAccount:async()=>({kind:'human'})} as never,realtimeRevocation:{revokeOwn},realtimeRevocationEnabled:true})
 const post=(body:unknown)=>app.request('/v1/realtime/revoke',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
 expect((await post({})).status).toBe(401);signedIn=true
 expect((await post({profileId:'spoof'})).status).toBe(422);expect(revokeOwn).not.toHaveBeenCalled()
 const response=await post({});expect(response.status).toBe(200);expect(await response.json()).toEqual({revoked:2});expect(response.headers.get('cache-control')).toBe('private, no-store')
 expect(revokeOwn).toHaveBeenCalledWith({subject:'verified'})
 revokeOwn.mockRejectedValue(Error('private database details'));const failure=await post({});expect(failure.status).toBe(503);expect(await failure.text()).not.toContain('private database')
});
it('no-ops only for an explicit disabled rollout, still requiring authentication',async()=>{
 for(const enabled of [false,true,undefined]){
  const app=new Hono<{Variables:ApiVariables}>();app.use('*',async(c,next)=>{c.set('requestId','disabled-test');await next()})
  registerRealtimeRevocationRoutes(app,{auth:{verify:async()=>({status:'authenticated',identity:{subject:'verified'}})},profiles:{getCurrentAccount:async()=>({kind:'human'})} as never,...(enabled===undefined?{}:{realtimeRevocationEnabled:enabled})})
  const response=await app.request('/v1/realtime/revoke',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})
  expect(response.status).toBe(enabled===false?200:503)
  if(enabled===false)expect(await response.json()).toEqual({revoked:0})
 }
});
it('allows authenticated accounts without a human profile to sign out, but never bypasses authentication',async()=>{
 for(const signedIn of [false,true]){
  const app=new Hono<{Variables:ApiVariables}>();app.use('*',async(c,next)=>{c.set('requestId','identity-test');await next()})
  const revokeOwn=vi.fn(async()=>1)
  registerRealtimeRevocationRoutes(app,{auth:{verify:async()=>signedIn?{status:'authenticated',identity:{subject:'verified'}}:{status:'missing'}},profiles:{getCurrentAccount:async()=>({kind:'ip'})} as never,realtimeRevocation:{revokeOwn},realtimeRevocationEnabled:false})
  expect((await app.request('/v1/realtime/revoke',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(signedIn?200:401)
  expect(revokeOwn).not.toHaveBeenCalled()
 }
})
it('no-ops for an absent profile, but fails closed when profile lookup fails',async()=>{
 const getCurrentAccount=vi.fn(async():Promise<null>=>null),revokeOwn=vi.fn(async()=>1)
 const app=new Hono<{Variables:ApiVariables}>();app.use('*',async(c,next)=>{c.set('requestId','absent-test');await next()})
 registerRealtimeRevocationRoutes(app,{auth:{verify:async()=>({status:'authenticated',identity:{subject:'verified'}})},profiles:{getCurrentAccount} as never,realtimeRevocation:{revokeOwn},realtimeRevocationEnabled:true})
 const post=()=>app.request('/v1/realtime/revoke',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})
 expect(await (await post()).json()).toEqual({revoked:0})
 getCurrentAccount.mockRejectedValue(Error('private'))
 expect((await post()).status).toBe(503);expect(revokeOwn).not.toHaveBeenCalled()
})
