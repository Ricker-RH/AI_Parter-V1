import {expect,it} from 'vitest'
import {HumanRelationshipBatchInputSchema,HumanRelationshipBatchSchema} from './human-relationships.js'
it('rejects logical duplicate UUIDs, unknown fields and more than50 identities',()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 expect(HumanRelationshipBatchInputSchema.safeParse({profileIds:[id,id.toUpperCase()]}).success).toBe(false)
 expect(HumanRelationshipBatchInputSchema.safeParse({profileIds:[id],subject:'spoof'}).success).toBe(false)
 expect(HumanRelationshipBatchInputSchema.safeParse({profileIds:Array.from({length:51},(_,i)=>`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`)}).success).toBe(false)
 expect(HumanRelationshipBatchSchema.safeParse({items:[{profileId:id,isOwner:false,following:false,followedBy:true,blocked:false,privateTabs:[]}]}).success).toBe(false)
});
