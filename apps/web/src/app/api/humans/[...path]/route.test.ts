import {afterEach,expect,it,vi} from 'vitest'
import {GET,PUT,DELETE} from './route'
import {fetchAifansApi} from '../../../../lib/server-api'
vi.mock('../../../../lib/server-api',()=>({fetchAifansApi:vi.fn()}))
const id='11111111-1111-4111-8111-111111111111'
const context=(path:string[])=>({params:Promise.resolve({path})})
const req=(path:string,method='PUT',body='{}',origin='https://app.test')=>new Request(`https://app.test/api/humans/${path}`,{method,headers:{origin,'content-type':'application/json'},...(method==='GET'?{}:{body})})
afterEach(()=>vi.resetAllMocks())
it('rejects query smuggling, nonempty bodies, forged paths and cross origin',async()=>{
 expect((await PUT(req(`${id}/follow?owner=true`),context([id,'follow']))).status).toBe(400)
 expect((await PUT(req(`${id}/follow`,'PUT','{"senderId":"x"}'),context([id,'follow']))).status).toBe(422)
 expect((await PUT(req(`${id}/follow`,'PUT','{}','https://evil.test'),context([id,'follow']))).status).toBe(403)
 expect((await GET(req('me','GET'),context(['me']))).status).toBe(404)
 expect(fetchAifansApi).not.toHaveBeenCalled()
})
it('proxies relation mutations through authenticated no-store boundary and checks response shape',async()=>{
 vi.mocked(fetchAifansApi).mockResolvedValueOnce(Response.json({changed:true})).mockResolvedValueOnce(Response.json({created:true}))
 const response=await DELETE(req(`${id}/block`,'DELETE'),context([id,'block']))
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store')
 expect(fetchAifansApi).toHaveBeenCalledWith(`/v1/humans/${id}/block`,expect.objectContaining({policy:'live-no-store',requestInit:expect.objectContaining({method:'DELETE',body:'{}'})}))
 expect((await PUT(req(`${id}/follow`),context([id,'follow']))).status).toBe(502)
})
it('classifies malformed upstream JSON as invalid response rather than network outage',async()=>{
 vi.mocked(fetchAifansApi).mockResolvedValue(new Response('not json',{headers:{'content-type':'application/json'}}))
 expect((await PUT(req(`${id}/follow`),context([id,'follow']))).status).toBe(502)
})
it('rejects oversized mutation bodies before forwarding',async()=>{
 expect((await PUT(req(`${id}/follow`,'PUT',`{"padding":"${'x'.repeat(33_000)}"}`),context([id,'follow']))).status).toBe(413)
 expect(fetchAifansApi).not.toHaveBeenCalled()
})
it('allows only bounded unique paging fields on visitor tab paths',async()=>{
 vi.mocked(fetchAifansApi).mockResolvedValue(Response.json({state:'ready',tab:'ips',items:[],nextCursor:null}))
 expect((await GET(req(`${id}/tabs/ips?limit=20&cursor=next_page`,'GET'),context([id,'tabs','ips']))).status).toBe(200)
 expect(fetchAifansApi).toHaveBeenCalledWith(`/v1/humans/${id}/tabs/ips?limit=20&cursor=next_page`,expect.anything())
 vi.mocked(fetchAifansApi).mockClear()
 for(const query of ['limit=51','limit=0','limit=01','cursor=','cursor=a&cursor=b','limit=20&limit=20','viewerId=forged'])expect((await GET(req(`${id}/tabs/ips?${query}`,'GET'),context([id,'tabs','ips']))).status).toBe(400)
 expect(fetchAifansApi).not.toHaveBeenCalled()
})
it('enforces locked-only shape and matching ready tab on proxy response',async()=>{
 vi.mocked(fetchAifansApi).mockResolvedValueOnce(Response.json({state:'locked',items:[]})).mockResolvedValueOnce(Response.json({state:'ready',tab:'following',items:[],nextCursor:null})).mockResolvedValueOnce(Response.json({state:'locked'}))
 expect((await GET(req(`${id}/tabs/ips`,'GET'),context([id,'tabs','ips']))).status).toBe(502)
 expect((await GET(req(`${id}/tabs/ips`,'GET'),context([id,'tabs','ips']))).status).toBe(502)
 const response=await GET(req(`${id}/tabs/ips`,'GET'),context([id,'tabs','ips']))
 expect(response.status).toBe(200);expect(await response.json()).toEqual({state:'locked'})
})
