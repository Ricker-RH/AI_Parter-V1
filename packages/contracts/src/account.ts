import {z} from 'zod'

export const LocaleSchema = z.enum(['en', 'zh-CN'])

const HttpUrlSchema = z.url({protocol: /^https?$/})

export const ProfileBackgroundColorKeySchema = z.enum([
  'paper',
  'sand',
  'mist',
  'sage',
  'sky',
  'lilac',
  'graphite',
])

export const ProfileBackgroundSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('color'),
    colorKey: ProfileBackgroundColorKeySchema,
  }),
  z.strictObject({
    type: z.literal('image'),
    url: HttpUrlSchema,
    focalX: z.number().min(0).max(1),
    focalY: z.number().min(0).max(1),
  }),
])

export const ProfileAssetRoleSchema = z.enum(['avatar', 'background'])
export const ProfileImageContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp'])

export const ProfileAssetIntentRequestSchema = z.strictObject({
  role: ProfileAssetRoleSchema,
  contentType: ProfileImageContentTypeSchema,
  sizeBytes: z.number().int().min(1).max(10_485_760),
  width: z.number().int().min(64).max(12_000),
  height: z.number().int().min(64).max(12_000),
})

export const ProfileAssetIntentSchema = z.strictObject({
  assetId: z.uuid(),
  method: z.literal('PUT'),
  url: HttpUrlSchema,
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
  maxBytes: z.number().int().min(1),
})

export const ProfileAssetConfirmationRequestSchema = z.strictObject({
  assetId: z.uuid(),
})

export const ProfileAssetConfirmationResponseSchema = z.strictObject({
  assetId: z.uuid(),
  role: ProfileAssetRoleSchema,
})

export const AccountSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['human', 'ip']),
  username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/),
  displayName: z.string().min(1).max(80),
  bio: z.string().max(500).nullable().optional(),
  avatarUrl: HttpUrlSchema.nullable().optional(),
  preferredLocale: LocaleSchema,
  creatorModeEnabled: z.boolean(),
  // Temporary legacy normalization; Task 2 replaces this with authoritative DB profile_version.
  profileVersion: z.number().int().positive().default(1),
  background: ProfileBackgroundSchema.default({type: 'color', colorKey: 'paper'}),
})

export const ProfileBackgroundInputSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('color'),
    colorKey: ProfileBackgroundColorKeySchema,
  }),
  z.strictObject({
    type: z.literal('image'),
    backgroundAssetId: z.uuid(),
    focalX: z.number().min(0).max(1),
    focalY: z.number().min(0).max(1),
  }),
])

export const UpdateCurrentAccountSchema = z.strictObject({
  profileVersion: z.number().int().positive(),
  username: z.string().trim().regex(/^[a-z0-9_]{3,30}$/).optional(),
  displayName: z.string().trim().min(1).max(80).regex(/[^\s]/).optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  preferredLocale: LocaleSchema.optional(),
  avatarAssetId: z.uuid().nullable().optional(),
  background: ProfileBackgroundInputSchema.optional(),
}).refine((value) => Object.entries(value).some(
  ([key, fieldValue]) => key !== 'profileVersion' && fieldValue !== undefined,
), {
  message: 'At least one profile field is required',
})

export type ProfileBackgroundColorKey = z.infer<typeof ProfileBackgroundColorKeySchema>
export type ProfileBackground = z.infer<typeof ProfileBackgroundSchema>
export type ProfileAssetRole = z.infer<typeof ProfileAssetRoleSchema>
export type ProfileImageContentType = z.infer<typeof ProfileImageContentTypeSchema>
export type ProfileAssetIntentRequest = z.infer<typeof ProfileAssetIntentRequestSchema>
export type ProfileAssetIntent = z.infer<typeof ProfileAssetIntentSchema>
export type ProfileAssetConfirmationRequest = z.infer<typeof ProfileAssetConfirmationRequestSchema>
export type ProfileAssetConfirmationResponse = z.infer<typeof ProfileAssetConfirmationResponseSchema>
export type ProfileBackgroundInput = z.infer<typeof ProfileBackgroundInputSchema>
export type UpdateCurrentAccount = z.infer<typeof UpdateCurrentAccountSchema>

export type Account = z.infer<typeof AccountSchema>
