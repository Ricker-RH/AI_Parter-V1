import {expect,it,vi} from 'vitest'
import {createPostgresRealtimeEphemeralRepository} from '../src/realtime-ephemeral.js'
import type {WithPlatformActor} from '../src/session.js'
it('resolves a recipient using service-only session-bound function, denies malformed rows',async()=>{
 const peer='22222222-2222-4222-8222-222222222222'; const query=vi.fn(async()=>({rows:[{peer_id:peer}],rowCount:1}))
 const withPlatformActor:WithPlatformActor=async(_actor,callback)=>callback({query,release(){}})
 const repository=createPostgresRealtimeEphemeralRepository({withPlatformActor})
 const input={sessionId:peer,profileId:peer,subject:'a',conversationId:peer,allowExpired:false}
 expect(await repository.resolve(input)).toBe(peer)
 expect(query).toHaveBeenCalledWith(expect.stringContaining('realtime_ephemeral_recipient'),[peer,'a',peer,peer,false])
 query.mockResolvedValue({rows:[{peer_id:'spoof'}],rowCount:1})
 expect(await repository.resolve(input)).toBeNull()
 expect(await repository.resolve({...input,conversationId:'bad'})).toBeNull()
})
