import {z} from 'zod'

export const LocaleSchema = z.enum(['en', 'zh-CN'])

export const AccountSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['human', 'ip']),
  username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/),
  displayName: z.string().min(1).max(80),
  bio: z.string().max(500).nullable().optional(),
  avatarUrl: z.url().nullable().optional(),
  preferredLocale: LocaleSchema,
  creatorModeEnabled: z.boolean(),
})

const EditableAccountFieldSchema = z.strictObject({
  username: z.string().trim().regex(/^[a-z0-9_]{3,30}$/).optional(),
  displayName: z.string().trim().min(1).max(80).regex(/[^\s]/).optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  preferredLocale: LocaleSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, {message: 'At least one profile field is required'})

export const UpdateCurrentAccountSchema = EditableAccountFieldSchema

export type UpdateCurrentAccount = z.infer<typeof UpdateCurrentAccountSchema>

export type Account = z.infer<typeof AccountSchema>
