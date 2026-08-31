import {z} from 'zod'

export const LocaleSchema = z.enum(['en', 'zh-CN'])

export const AccountSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['human', 'ip']),
  username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/),
  displayName: z.string().min(1).max(80),
  avatarUrl: z.url().nullable().optional(),
  preferredLocale: LocaleSchema,
  creatorModeEnabled: z.boolean(),
})

export type Account = z.infer<typeof AccountSchema>
