import {expect,it,vi} from 'vitest'
vi.mock('../../../../lib/server-api',()=>({fetchAifansApi:vi.fn()}))
import {fetchAifansApi} from '../../../../lib/server-api'
import {POST} from './route'
it('accepts only same-origin empty logout revocation, forwards auth and preserves failures',async()=>{
 const request=(body:unknown={},origin='https://app.test')=>new Request('https://app.test/api/realtime/revoke',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
 expect((await POST(request({},'https://evil.test'))).status).toBe(403)
 expect((await POST(request({profileId:'spoof'}))).status).toBe(422)
 expect(fetchAifansApi).not.toHaveBeenCalled()
 vi.mocked(fetchAifansApi).mockResolvedValue(Response.json({revoked:2}));const result=await POST(request());expect(result.status).toBe(200);expect(await result.json()).toEqual({revoked:2})
 expect(fetchAifansApi).toHaveBeenCalledWith('/v1/realtime/revoke',expect.objectContaining({policy:'live-no-store',trustedClientHeaders:expect.any(Headers),requestInit:expect.objectContaining({method:'POST',body:'{}'})}))
 vi.mocked(fetchAifansApi).mockResolvedValue(Response.json({revoked:'2'}));expect((await POST(request())).status).toBe(503)
});
