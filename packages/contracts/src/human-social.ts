import {z} from 'zod'

export const HumanIdentitySchema = z.strictObject({
  kind: z.literal('HUMAN'),
  id: z.uuid(),
  displayName: z.string().trim().min(1).max(80),
  username: z.string().min(3).max(30),
  avatarUrl: z.url({protocol: /^https$/}).max(2048)
    .regex(/^https:\/\/[^/?#\\@]+(?:[/?#]|$)/i, {message: 'Avatar URLs must not contain credentials'}).nullable(),
})
export const HumanVisibilitySchema = z.enum(['public', 'private'])
export const HumanMessageDisabledReasonSchema = z.enum(['self', 'blocked', 'account_unavailable', 'authentication_required', 'mutual_follow_required'])
export const HumanRelationshipSchema = z.strictObject({
  following: z.boolean(),
  followedBy: z.boolean(),
  blockedByViewer: z.boolean(),
  canMessage: z.boolean(),
  messageDisabledReason: HumanMessageDisabledReasonSchema.nullable(),
}).refine((value) => value.canMessage === (value.messageDisabledReason === null), {
  message: 'Messaging availability must match its disabled reason',
}).refine((value) => !value.blockedByViewer || (!value.canMessage && value.messageDisabledReason === 'blocked'), {
  message: 'Blocked peers cannot be messaged',
})
export const HumanProfileTabSchema = z.discriminatedUnion('state', [
  z.strictObject({state: z.literal('available')}),
  z.strictObject({state: z.literal('locked')}),
])
export const HumanProfileSchema = z.strictObject({
  v: z.literal(1),
  identity: HumanIdentitySchema,
  visibility: HumanVisibilitySchema,
  isOwner: z.boolean(),
  relationship: HumanRelationshipSchema,
  tabs: z.strictObject({ips: HumanProfileTabSchema, liked: HumanProfileTabSchema, saved: HumanProfileTabSchema, following: HumanProfileTabSchema}),
}).refine((value) => value.isOwner || value.visibility === 'public' || Object.values(value.tabs).every((tab) => tab.state === 'locked'), {
  message: 'Private non-owner profile tabs must remain locked',
}).refine((value) => !value.isOwner || Object.values(value.tabs).every((tab) => tab.state === 'available'), {
  message: 'Owner profile tabs must be available',
})
export const HumanPreferencesUpdateInputSchema = z.strictObject({
  visibility: HumanVisibilitySchema.optional(),
  showPresence: z.boolean().optional(),
}).refine((value) => value.visibility !== undefined || value.showPresence !== undefined, {message: 'At least one preference is required'})

export type HumanIdentity = z.infer<typeof HumanIdentitySchema>
export type HumanVisibility = z.infer<typeof HumanVisibilitySchema>
export type HumanRelationship = z.infer<typeof HumanRelationshipSchema>
export type HumanProfile = z.infer<typeof HumanProfileSchema>
export type HumanPreferencesUpdateInput = z.infer<typeof HumanPreferencesUpdateInputSchema>
