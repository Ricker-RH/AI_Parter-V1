import {afterEach,expect,it,vi} from 'vitest'
import {GET,PATCH} from './route'
import {fetchAifansApi} from '../../../lib/server-api'
vi.mock('../../../lib/server-api',()=>({fetchAifansApi:vi.fn()}))
afterEach(()=>vi.resetAllMocks())
const request=(body:string,origin='https://app.test')=>new Request('https://app.test/api/human-preferences',{method:'PATCH',headers:{origin,'content-type':'application/json'},body})
it('reads complete stored preferences and forwards only validated partial mutations',async()=>{
 vi.mocked(fetchAifansApi).mockImplementation(async()=>Response.json({visibility:'private',showPresence:false}))
 expect(await (await GET(new Request('https://app.test/api/human-preferences'))).json()).toEqual({visibility:'private',showPresence:false})
 expect((await PATCH(request('{"visibility":"private"}'))).status).toBe(200)
 expect(fetchAifansApi).toHaveBeenLastCalledWith('/v1/human-preferences',expect.objectContaining({policy:'live-no-store',requestInit:expect.objectContaining({method:'PATCH',body:'{"visibility":"private"}'})}))
})
it('rejects cross origin, spoofing, empty updates, duplicate keys, and query parameters',async()=>{
 expect((await PATCH(request('{"visibility":"public"}','https://evil.test'))).status).toBe(403)
 for(const body of ['{}','{"showPresence":true,"actor":"forged"}','{"showPresence":true,"showPresence":false}'])expect((await PATCH(request(body))).status).toBe(422)
 expect((await GET(new Request('https://app.test/api/human-preferences?profileId=forged'))).status).toBe(400)
 expect(fetchAifansApi).not.toHaveBeenCalled()
})
it('fails closed if a response omits stored presence or includes secrets',async()=>{
 for(const body of [{visibility:'private'},{visibility:'private',showPresence:false,secret:'x'}]){
  vi.mocked(fetchAifansApi).mockResolvedValue(Response.json(body))
  const response=await GET(new Request('https://app.test/api/human-preferences'))
  expect(response.status).toBe(502);expect(response.headers.get('cache-control')).toBe('private, no-store')
 }
})
