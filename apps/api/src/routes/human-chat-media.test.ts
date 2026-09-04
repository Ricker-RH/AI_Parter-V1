import {Hono} from 'hono'
import {describe,it,expect,vi} from 'vitest'
import {registerHumanChatMediaRoutes} from './human-chat-media.js'
import type {ApiVariables} from '../middleware/request-id.js'
const id='edc5b166-125d-4af3-ac8c-233a773f66c1'
function setup(){
 const port={reserve:vi.fn(async()=>({attachmentId:id,upload:{method:'PUT',url:'https://private.test/put',headers:{'content-type':'image/png'},expiresAt:'2026-09-04T10:10:00Z',maxBytes:10485760}})),finalize:vi.fn(async()=>({attachmentId:id,kind:'image',contentType:'image/webp',sizeBytes:10,width:1,height:1})),download:vi.fn(async()=>({url:'https://private.test/get',expiresAt:'2026-09-04T10:01:00Z',attachment:{attachmentId:id,kind:'image',contentType:'image/webp',sizeBytes:10,width:1,height:1}}))}
 const app=new Hono<{Variables:ApiVariables}>()
 app.use('*',async(c,next)=>{c.set('requestId','media-test');await next()})
 registerHumanChatMediaRoutes(app,{auth:{verify:async()=>({status:'authenticated',identity:{subject:'user'}})} as never,profiles:{getCurrentAccount:async()=>({id,kind:'human'})} as never,humanChatMedia:port as never})
 return {app,port}
}
describe('private HUMAN media routes',()=>{
 it('keeps responses no-store and sends only authenticated actor, peer, validated fields',async()=>{
  const {app,port}=setup()
  const response=await app.request(`/v1/human-chat/peers/${id}/attachments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'image',contentType:'image/png',sizeBytes:10})})
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(port.reserve).toHaveBeenCalledWith({subject:'user'},id,{kind:'image',contentType:'image/png',sizeBytes:10})
 })
 it('rejects client-chosen storage keys and malformed queries before storage',async()=>{
  const {app,port}=setup()
  const response=await app.request(`/v1/human-chat/peers/${id}/attachments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'image',contentType:'image/png',sizeBytes:10,objectKey:'private/forged'})})
  expect(response.status).toBe(400);expect(port.reserve).not.toHaveBeenCalled()
  expect((await app.request(`/v1/human-chat/attachments/${id}/download?url=forged`)).status).toBe(400)
 })
 it('finalizes with no client metadata and privately authorizes download',async()=>{
  const {app,port}=setup()
  expect((await app.request(`/v1/human-chat/attachments/${id}/finalize`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(200)
  expect(port.finalize).toHaveBeenCalledWith({subject:'user'},id)
  const response=await app.request(`/v1/human-chat/attachments/${id}/download`)
  expect(response.status).toBe(200);expect(port.download).toHaveBeenCalledWith({subject:'user'},id)
  port.download.mockRejectedValueOnce(Object.assign(new Error('private'),{code:'P0002'}))
  expect((await app.request(`/v1/human-chat/attachments/${id}/download`)).status).toBe(404)
 })
})
