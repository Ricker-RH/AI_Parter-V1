import {z} from 'zod'

const postgresUrl = z.url().refine((value) => {
  const protocol = new URL(value).protocol
  return protocol === 'postgres:' || protocol === 'postgresql:'
})

const httpsUrl = z.url().refine((value) => new URL(value).protocol === 'https:')

const environmentSchema = z.object({
  DATABASE_USER_URL: postgresUrl,
  DATABASE_PLATFORM_URL: postgresUrl,
  DATABASE_PROVISIONING_URL: postgresUrl,
  NEON_AUTH_JWKS_URL: httpsUrl,
  NEON_AUTH_ISSUER: httpsUrl,
  NEON_AUTH_AUDIENCE: z.string().trim().min(1).max(200),
  DIFY_API_URL: httpsUrl.optional(),
  DIFY_API_KEY: z.string().trim().min(1).optional(),
  POSTHOG_API_KEY: z.string().trim().min(1).optional(),
  POSTHOG_HOST: httpsUrl.optional(),
  ANALYTICS_CRON_SECRET: z.string().min(32).optional(),
  DATABASE_ANALYTICS_URL: postgresUrl.optional(),
})

export type ApiEnvironment = {
  databaseUserUrl: string
  databasePlatformUrl: string
  databaseProvisioningUrl: string
  auth: {jwksUrl: string; issuer: string; audience: string}
  dify?: {baseUrl: string; apiKey: string}
  analytics?: {databaseUrl: string; projectKey: string; host: string; cronSecret: string}
}

export function readApiEnv(environment: Record<string, string | undefined>): ApiEnvironment {
  const result = environmentSchema.safeParse(environment)
  if (!result.success) throw new Error('Invalid API environment')
  const value = result.data
  if ((value.DIFY_API_URL === undefined) !== (value.DIFY_API_KEY === undefined)) {
    throw new Error('Invalid API environment')
  }
  const analyticsValues = [value.DATABASE_ANALYTICS_URL, value.POSTHOG_API_KEY, value.POSTHOG_HOST, value.ANALYTICS_CRON_SECRET]
  if (analyticsValues.some((item) => item !== undefined) && analyticsValues.some((item) => item === undefined)) {
    throw new Error('Invalid API environment')
  }
  return {
    databaseUserUrl: value.DATABASE_USER_URL,
    databasePlatformUrl: value.DATABASE_PLATFORM_URL,
    databaseProvisioningUrl: value.DATABASE_PROVISIONING_URL,
    auth: {
      jwksUrl: value.NEON_AUTH_JWKS_URL,
      issuer: value.NEON_AUTH_ISSUER,
      audience: value.NEON_AUTH_AUDIENCE,
    },
    ...(value.DIFY_API_URL && value.DIFY_API_KEY
      ? {dify: {baseUrl: value.DIFY_API_URL, apiKey: value.DIFY_API_KEY}}
      : {}),
    ...(value.DATABASE_ANALYTICS_URL && value.POSTHOG_API_KEY && value.POSTHOG_HOST && value.ANALYTICS_CRON_SECRET
      ? {analytics: {databaseUrl: value.DATABASE_ANALYTICS_URL, projectKey: value.POSTHOG_API_KEY, host: value.POSTHOG_HOST, cronSecret: value.ANALYTICS_CRON_SECRET}}
      : {}),
  }
}
