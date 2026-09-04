import {expect,it,vi} from 'vitest'
import {createRealtimeRevocationRepository} from '../src/realtime-revocation.js'
import type {WithActor} from '../src/session.js'
it('revokes only owner sessions using the verified actor and no caller-controlled IDs',async()=>{
 const query=vi.fn(async()=>({rows:[{revoked:2}],rowCount:1}));const withActor:WithActor=vi.fn(async(_actor,run)=>run({query,release(){}}))
 const repo=createRealtimeRevocationRepository({withActor})
 expect(await repo.revokeOwn({subject:'verified'})).toBe(2)
 expect(withActor).toHaveBeenCalledWith({subject:'verified'},expect.any(Function))
 expect(query).toHaveBeenCalledExactlyOnceWith('SELECT public.revoke_own_realtime_sessions() AS revoked')
 query.mockResolvedValue({rows:[{revoked:-1}],rowCount:1});await expect(repo.revokeOwn({subject:'verified'})).rejects.toThrow()
});
