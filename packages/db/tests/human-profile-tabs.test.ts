import {describe,it,expect,vi} from 'vitest'
import {createHumanProfileTabsRepository} from '../src/human-profile-tabs.js'
const profileId='11111111-1111-4111-8111-111111111111'
describe('human tab repository',()=>{
 it('uses real viewer session, returns locked without any incidental projection fields',async()=>{
  const query=vi.fn(async()=>({rows:[{state:'locked',item:null,sort_at:null,item_id:null}]}))
  const withActor=vi.fn(async(_actor,fn)=>fn({query})),withPublic=vi.fn(async fn=>fn({query}))
  const repository=createHumanProfileTabsRepository({withActor,withPublic})
  expect(await repository.getTab({viewer:{subject:'verified'},profileId,tab:'liked',limit:20})).toEqual({state:'locked'})
  expect(withActor.mock.calls[0]?.[0]).toEqual({subject:'verified'});expect(withPublic).not.toHaveBeenCalled()
 })
 it('rejects malformed cursors before database access',async()=>{
  const withActor=vi.fn(),withPublic=vi.fn();const repository=createHumanProfileTabsRepository({withActor,withPublic})
  await expect(repository.getTab({viewer:null,profileId,tab:'ips',limit:20,cursor:'garbage'})).rejects.toMatchObject({code:'22023'})
  expect(withPublic).not.toHaveBeenCalled()
 })
})
