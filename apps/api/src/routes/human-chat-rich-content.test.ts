import {Hono} from 'hono'
import {describe,it,expect,vi} from 'vitest'
import {registerHumanChatRichContentRoutes} from './human-chat-rich-content.js'
import type {ApiVariables} from '../middleware/request-id.js'
const id='edc5b166-125d-4af3-ac8c-233a773f66c1'
function setup(){
 const port={listTargets:vi.fn(async()=>({items:[{target:{kind:'human',id},title:'Server Name',subtitle:'@name'}]})),listShareRecipients:vi.fn(async()=>({items:[{id,displayName:'Mutual',avatarUrl:null}]})),resolveTarget:vi.fn(async()=>({state:'unavailable'}))}
 const app=new Hono<{Variables:ApiVariables}>();app.use('*',async(c,next)=>{c.set('requestId','test');await next()})
 registerHumanChatRichContentRoutes(app,{auth:{verify:async()=>({status:'authenticated',identity:{subject:'owner'}})} as never,profiles:{getCurrentAccount:async()=>({kind:'human'})} as never,humanChatRichContent:port as never})
 return {app,port}
}
describe('HUMAN internal share routes',()=>{
 it('bounds selection and resolves only validated target IDs under real actor',async()=>{
  const {app,port}=setup()
  const response=await app.request('/v1/human-chat/share-targets?kind=human&q=Name&limit=20')
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(port.listTargets).toHaveBeenCalledWith({subject:'owner'},{kind:'human',q:'Name',limit:20})
  expect((await app.request(`/v1/human-chat/share-targets/post/${id}`)).status).toBe(200)
  expect(port.resolveTarget).toHaveBeenCalledWith({subject:'owner'},{kind:'post',id})
  const recipients=await app.request('/v1/human-chat/share-recipients')
  expect(recipients.status).toBe(200);expect(await recipients.json()).toEqual({items:[{id,displayName:'Mutual',avatarUrl:null}]})
  expect(port.listShareRecipients).toHaveBeenCalledWith({subject:'owner'})
 })
 it('rejects URL targets, unknown/duplicate query keys and invalid bounds',async()=>{
  const {app,port}=setup()
  for(const query of ['kind=human&limit=21','kind=post&viewerId=forged','kind=post&kind=human','kind=url','kind=human&q='+ 'x'.repeat(81)])expect((await app.request('/v1/human-chat/share-targets?'+query)).status).toBe(400)
  expect((await app.request(`/v1/human-chat/share-targets/url/${id}`)).status).toBe(400)
  expect(port.listTargets).not.toHaveBeenCalled();expect(port.resolveTarget).not.toHaveBeenCalled()
 })
})
