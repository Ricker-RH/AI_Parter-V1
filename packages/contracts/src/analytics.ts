import {z} from 'zod'

const uuid = z.string().uuid()

export const AnalyticsDeliveryIdentitySchema = z.discriminatedUnion('actorKind', [
  z.strictObject({actorKind: z.literal('human'), actorProfileId: uuid, distinctId: uuid}),
  z.strictObject({actorKind: z.literal('ip'), actorProfileId: uuid, distinctId: z.string().regex(/^aifans:ip:[0-9a-f-]{36}$/)}),
  z.strictObject({actorKind: z.literal('system'), actorProfileId: z.null(), distinctId: z.literal('aifans:system')}),
]).superRefine((identity, context) => {
  if (identity.actorKind === 'human' && identity.distinctId !== identity.actorProfileId) {
    context.addIssue({code: 'custom', message: 'Human analytics identity must use the actor profile UUID'})
  }
  if (identity.actorKind === 'ip' && identity.distinctId !== `aifans:ip:${identity.actorProfileId}`) {
    context.addIssue({code: 'custom', message: 'IP analytics identity must use its stable namespace'})
  }
})

export type AnalyticsDeliveryIdentity = z.infer<typeof AnalyticsDeliveryIdentitySchema>

export function createAnalyticsDeliveryIdentity(
  actorKind: 'human' | 'ip' | null,
  actorProfileId: string | null,
): AnalyticsDeliveryIdentity {
  const candidate = actorKind === null
    ? {actorKind: 'system' as const, actorProfileId, distinctId: 'aifans:system' as const}
    : actorKind === 'human'
      ? {actorKind, actorProfileId, distinctId: actorProfileId}
      : {actorKind, actorProfileId, distinctId: `aifans:ip:${actorProfileId}`}
  return AnalyticsDeliveryIdentitySchema.parse(candidate)
}
