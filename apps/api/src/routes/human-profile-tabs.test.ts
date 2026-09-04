import {Hono} from 'hono'
import {describe,it,expect,vi} from 'vitest'
import {registerHumanProfileTabsRoutes} from './human-profile-tabs.js'
import type {ApiVariables} from '../middleware/request-id.js'
import {requestIdMiddleware} from '../middleware/request-id.js'
const id='11111111-1111-4111-8111-111111111111'
function testApp(){const app=new Hono<{Variables:ApiVariables}>();app.use('*',requestIdMiddleware);return app}
describe('public HUMAN tab routes',()=>{
 it('returns only locked state for direct private activity URLs and passes anonymous identity',async()=>{
  const app=testApp(),getTab=vi.fn(async()=>({state:'locked' as const}))
  registerHumanProfileTabsRoutes(app,{humanProfileTabs:{getTab}})
  for(const tab of ['ips','liked','saved','following']){const response=await app.request(`/v1/humans/${id}/tabs/${tab}`);expect(response.status).toBe(200);expect(await response.json()).toEqual({state:'locked'});expect(getTab).toHaveBeenLastCalledWith({viewer:null,profileId:id,tab,limit:20})}
 })
 it('rejects invalid bearer tokens before validation or repository access',async()=>{
  const app=testApp(),getTab=vi.fn()
  registerHumanProfileTabsRoutes(app,{auth:{verify:async()=>({status:'invalid'})},humanProfileTabs:{getTab}})
  expect((await app.request(`/v1/humans/${id}/tabs/liked?limit=99`)).status).toBe(401);expect(getTab).not.toHaveBeenCalled()
 })
 it('strictly validates limits, cursors, profile and tab paths',async()=>{
  const app=testApp(),getTab=vi.fn()
  registerHumanProfileTabsRoutes(app,{humanProfileTabs:{getTab}})
  for(const suffix of ['liked?limit=0','liked?limit=51','liked?limit=1&limit=2','liked?viewer=owner','liked?cursor=','wrong'])expect((await app.request(`/v1/humans/${id}/tabs/${suffix}`)).status).toBe(400)
  expect(getTab).not.toHaveBeenCalled()
 })
})
