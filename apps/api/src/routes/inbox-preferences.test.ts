import {describe,it,expect,vi} from 'vitest'
import {AccountSchema} from '@aifans/contracts'
import {createApp} from '../application.js'
const id='11111111-1111-4111-8111-111111111111'
function setup(logged=true){const inboxPreferences={list:vi.fn(async()=>({items:[]})),mutate:vi.fn(async()=>{})};const app=createApp({auth:{verify:vi.fn(async()=>logged?{status:'authenticated' as const,identity:{subject:'actor'}}:{status:'missing' as const})},profiles:{ensureHumanProfile:vi.fn(),getCurrentAccount:vi.fn(async()=>AccountSchema.parse({id,kind:'human',username:'user',displayName:'User',preferredLocale:'en',creatorModeEnabled:false}))},inboxPreferences});return {app,inboxPreferences}}
describe('inbox preferences',()=>{
 it('requires authentication',async()=>{expect((await setup(false).app.request('/v1/inbox/preferences')).status).toBe(401)})
 it('rejects forged actor fields before mutation',async()=>{const {app,inboxPreferences}=setup();expect((await app.request('/v1/inbox/preferences',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'HUMAN',conversationId:id,action:'delete',profileId:id})})).status).toBe(400);expect(inboxPreferences.mutate).not.toHaveBeenCalled()})
 it('uses verified actor and hides inaccessible conversations',async()=>{const {app,inboxPreferences}=setup();const req={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'IP',conversationId:id,action:'delete'})};expect((await app.request('/v1/inbox/preferences',req)).status).toBe(200);expect(inboxPreferences.mutate).toHaveBeenCalledWith({subject:'actor'},{kind:'IP',conversationId:id,action:'delete'});inboxPreferences.mutate.mockRejectedValueOnce({code:'P0002'});expect((await app.request('/v1/inbox/preferences',req)).status).toBe(404)})
})
