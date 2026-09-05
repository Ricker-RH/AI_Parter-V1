import {z} from 'zod'
export const InboxPreferenceInputSchema=z.strictObject({kind:z.enum(['HUMAN','IP']),conversationId:z.uuid(),action:z.enum(['pin','unpin','delete'])})
export const InboxPreferencesSchema=z.strictObject({items:z.array(z.strictObject({kind:z.enum(['HUMAN','IP']),conversationId:z.uuid(),pinnedAt:z.string().datetime().nullable(),deletedAt:z.string().datetime().nullable()}))})
