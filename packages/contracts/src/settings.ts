import {z} from 'zod'

export const AppSettingsSchema = z.object({
  creatorIpRequiresApproval: z.boolean(),
  defaultIpQuota: z.int().min(0).max(100),
})

export type AppSettings = z.infer<typeof AppSettingsSchema>

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
})
