import {expect,it,vi} from 'vitest'
vi.mock('../../../lib/server-api',()=>({fetchAifansApi:vi.fn()}))
import {fetchAifansApi} from '../../../lib/server-api'
import {POST} from './route'
const id='11111111-1111-4111-8111-111111111111'
it('bounds and authenticates the same-origin read batch without identity forwarding',async()=>{
 const request=(body:unknown,origin='https://app.test')=>new Request('https://app.test/api/human-relationships',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
 expect((await POST(request({profileIds:[id]},'https://evil.test'))).status).toBe(403)
 expect((await POST(request({profileIds:[id,id]}))).status).toBe(400)
 vi.mocked(fetchAifansApi).mockResolvedValue(Response.json({items:[]}))
 expect((await POST(request({profileIds:[id]}))).status).toBe(200)
 expect(fetchAifansApi).toHaveBeenCalledWith('/v1/human-relationships',expect.objectContaining({policy:'live-no-store',requestInit:expect.objectContaining({method:'POST',body:JSON.stringify({profileIds:[id]})})}))
});
