import {z} from 'zod'
export const HumanRelationshipBatchInputSchema=z.strictObject({profileIds:z.array(z.uuid().transform(id=>id.toLowerCase())).min(1).max(50).refine(ids=>new Set(ids).size===ids.length)})
export const HumanRelationshipSummarySchema=z.strictObject({profileId:z.uuid(),isOwner:z.boolean(),following:z.boolean(),followedBy:z.boolean(),blocked:z.boolean()})
export const HumanRelationshipBatchSchema=z.strictObject({items:z.array(HumanRelationshipSummarySchema).max(50).refine(items=>new Set(items.map(item=>item.profileId)).size===items.length)})
export type HumanRelationshipSummary=z.infer<typeof HumanRelationshipSummarySchema>
export type HumanRelationshipBatch=z.infer<typeof HumanRelationshipBatchSchema>
