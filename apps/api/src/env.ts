import { z } from "zod";

const postgresUrl = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "postgres:" || protocol === "postgresql:";
});

const httpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:");
const publicBaseUrl = httpsUrl.refine((value) => {
  const url = new URL(value);
  return !url.username && !url.password && !url.search && !url.hash;
});

const environmentSchema = z.object({
  DATABASE_USER_URL: postgresUrl,
  DATABASE_PLATFORM_URL: postgresUrl,
  DATABASE_PROVISIONING_URL: postgresUrl,
  DATABASE_RATE_LIMIT_URL:postgresUrl.optional(),
  RATE_LIMIT_HMAC_SECRET:z.string().min(32).optional(),
  NEON_AUTH_JWKS_URL: httpsUrl,
  NEON_AUTH_ISSUER: httpsUrl,
  NEON_AUTH_AUDIENCE: z.string().trim().min(1).max(200),
  DIFY_API_URL: httpsUrl.optional(),
  DIFY_API_KEY: z.string().trim().min(1).optional(),
  POSTHOG_API_KEY: z.string().trim().min(1).optional(),
  POSTHOG_HOST: httpsUrl.optional(),
  ANALYTICS_CRON_SECRET: z.string().min(32).optional(),
  DATABASE_ANALYTICS_URL: postgresUrl.optional(),
  R2_ACCOUNT_ID: z
    .string()
    .regex(/^[a-f0-9]{32}$/i)
    .optional(),
  R2_ACCESS_KEY_ID: z.string().trim().min(1).max(512).optional(),
  R2_SECRET_ACCESS_KEY: z.string().trim().min(1).max(1024).optional(),
  R2_PUBLIC_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .optional(),
  R2_PRIVATE_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .optional(),
  R2_PUBLIC_BASE_URL: publicBaseUrl.optional(),
});

export type ApiEnvironment = {
  databaseUserUrl: string;
  databasePlatformUrl: string;
  databaseProvisioningUrl: string;
  auth: { jwksUrl: string; issuer: string; audience: string };
  dify?: { baseUrl: string; apiKey: string };
  analytics?: {
    databaseUrl: string;
    projectKey: string;
    host: string;
    cronSecret: string;
  };
  postMedia?: R2PostMediaConfig;
  rateLimit?:{databaseUrl:string;hmacSecret:string};
};
export type R2PostMediaConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  endpoint: string;
};

export function readApiEnv(
  environment: Record<string, string | undefined>,
): ApiEnvironment {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) throw new Error("Invalid API environment");
  const value = result.data;
  if (
    (value.DIFY_API_URL === undefined) !==
    (value.DIFY_API_KEY === undefined)
  ) {
    throw new Error("Invalid API environment");
  }
  if((value.DATABASE_RATE_LIMIT_URL===undefined)!==(value.RATE_LIMIT_HMAC_SECRET===undefined)) throw new Error('Invalid API environment')
  const analyticsValues = [
    value.DATABASE_ANALYTICS_URL,
    value.POSTHOG_API_KEY,
    value.POSTHOG_HOST,
    value.ANALYTICS_CRON_SECRET,
  ];
  if (
    analyticsValues.some((item) => item !== undefined) &&
    analyticsValues.some((item) => item === undefined)
  ) {
    throw new Error("Invalid API environment");
  }
  const postMediaValues = [
    value.R2_ACCOUNT_ID,
    value.R2_ACCESS_KEY_ID,
    value.R2_SECRET_ACCESS_KEY,
    value.R2_PUBLIC_BUCKET,
    value.R2_PUBLIC_BASE_URL,
  ];
  if (
    (value.R2_PUBLIC_BUCKET !== undefined ||
      value.R2_PUBLIC_BASE_URL !== undefined) &&
    postMediaValues.some((item) => item === undefined)
  )
    throw new Error("Invalid API environment");
  const sharedR2 = [
    value.R2_ACCOUNT_ID,
    value.R2_ACCESS_KEY_ID,
    value.R2_SECRET_ACCESS_KEY,
  ];
  if (value.R2_PRIVATE_BUCKET && sharedR2.some((item) => item === undefined))
    throw new Error("Invalid API environment");
  if (
    sharedR2.some((item) => item !== undefined) &&
    !value.R2_PRIVATE_BUCKET &&
    !value.R2_PUBLIC_BUCKET
  )
    throw new Error("Invalid API environment");
  return {
    databaseUserUrl: value.DATABASE_USER_URL,
    databasePlatformUrl: value.DATABASE_PLATFORM_URL,
    databaseProvisioningUrl: value.DATABASE_PROVISIONING_URL,
    auth: {
      jwksUrl: value.NEON_AUTH_JWKS_URL,
      issuer: value.NEON_AUTH_ISSUER,
      audience: value.NEON_AUTH_AUDIENCE,
    },
    ...(value.DATABASE_RATE_LIMIT_URL&&value.RATE_LIMIT_HMAC_SECRET?{rateLimit:{databaseUrl:value.DATABASE_RATE_LIMIT_URL,hmacSecret:value.RATE_LIMIT_HMAC_SECRET}}:{}),
    ...(value.DIFY_API_URL && value.DIFY_API_KEY
      ? { dify: { baseUrl: value.DIFY_API_URL, apiKey: value.DIFY_API_KEY } }
      : {}),
    ...(value.DATABASE_ANALYTICS_URL &&
    value.POSTHOG_API_KEY &&
    value.POSTHOG_HOST &&
    value.ANALYTICS_CRON_SECRET
      ? {
          analytics: {
            databaseUrl: value.DATABASE_ANALYTICS_URL,
            projectKey: value.POSTHOG_API_KEY,
            host: value.POSTHOG_HOST,
            cronSecret: value.ANALYTICS_CRON_SECRET,
          },
        }
      : {}),
    ...(value.R2_ACCOUNT_ID &&
    value.R2_ACCESS_KEY_ID &&
    value.R2_SECRET_ACCESS_KEY &&
    value.R2_PUBLIC_BUCKET &&
    value.R2_PUBLIC_BASE_URL
      ? {
          postMedia: {
            accountId: value.R2_ACCOUNT_ID,
            accessKeyId: value.R2_ACCESS_KEY_ID,
            secretAccessKey: value.R2_SECRET_ACCESS_KEY,
            bucket: value.R2_PUBLIC_BUCKET,
            publicBaseUrl: value.R2_PUBLIC_BASE_URL.replace(/\/+$/, ""),
            endpoint: `https://${value.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          },
        }
      : {}),
  };
}
