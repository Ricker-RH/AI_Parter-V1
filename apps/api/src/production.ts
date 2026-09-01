import {
  createAnalyticsOutboxRepositoryFromUrl,
  createRateLimitRepositoryFromUrl,
  createReadinessProbeFromUrl,
  createDatabaseRuntimeRepositories,
  type DatabaseRuntimeRepositories,
  type DatabaseRuntimeUrls,
} from "@aifans/db";
import { createApp, type AppDependencies } from "./application.js";
import { createDifyChatPort } from "./adapters/dify-chat.js";
import { createNeonJwtAuthVerifier } from "./adapters/neon-auth-jwt.js";
import { createPostHogAnalyticsCapture } from "./adapters/posthog-analytics.js";
import { r2AssetPortFromEnv } from "./adapters/r2-assets.js";
import { readApiEnv } from "./env.js";
import { createAnalyticsDeliveryWorker } from "./ports/analytics.js";
import { createR2PostMediaPort } from "./adapters/r2-post-media.js";
import {jsonConsoleLogger} from './ports/logger.js'
import type {RateLimitPort} from './ports/rate-limit.js'
import type {ReadinessPort} from './ports/readiness.js'

type ProductionFactories = {
  createDatabaseRuntime(urls: DatabaseRuntimeUrls): DatabaseRuntimeRepositories;
  createRateLimit(url:string):RateLimitPort;
  createReadiness(url:string):ReadinessPort;
};

const productionFactories: ProductionFactories = {
  createDatabaseRuntime: createDatabaseRuntimeRepositories,
  createRateLimit:createRateLimitRepositoryFromUrl,
  createReadiness:createReadinessProbeFromUrl,
};

export function createProductionDependencies(
  environment: Record<string, string | undefined> = process.env,
  factoryOverrides: Partial<ProductionFactories> = {},
): AppDependencies {
  const factories={...productionFactories,...factoryOverrides}
  const env = readApiEnv(environment);
  const database = factories.createDatabaseRuntime({
    userUrl: env.databaseUserUrl,
    platformUrl: env.databasePlatformUrl,
    provisioningUrl: env.databaseProvisioningUrl,
    ...(env.postMedia
      ? { publicMediaBaseUrl: env.postMedia.publicBaseUrl }
      : {}),
  });
  const analyticsWorker = env.analytics
    ? createAnalyticsDeliveryWorker({
        outbox: createAnalyticsOutboxRepositoryFromUrl(
          env.analytics.databaseUrl,
        ),
        capture: createPostHogAnalyticsCapture({
          projectKey: env.analytics.projectKey,
          host: env.analytics.host,
        }),
      })
    : undefined;
  const assets = environment.R2_PRIVATE_BUCKET
    ? r2AssetPortFromEnv(environment)
    : undefined;
  const readiness=factories.createReadiness(env.databaseUserUrl)
  return {
    auth: createNeonJwtAuthVerifier({
      ...env.auth,
      onVerification(event) {
        if (event.status !== 'authenticated') console.info(JSON.stringify({event: 'auth_verification', ...event}))
      },
    }),
    authority: database.authority,
    platformSocial: database.platformSocial,
    profiles: database.profiles,
    social: database.social,
    chatTargets: database.chatTargets,
    creator: database.creator,
    platformCreator: database.platformCreator,
    requireRateLimit:true,
    rateLimitIdentitySecret:env.webApiRateLimitSigningSecret,
    ...(env.rateLimit?{rateLimit:factories.createRateLimit(env.rateLimit.databaseUrl),rateLimitHmacSecret:env.rateLimit.hmacSecret}:{}),
    readiness:{check:async()=>Boolean(env.rateLimit)&&await readiness.check()},
    logger:jsonConsoleLogger,
    onUnhandledError(diagnostic) {
      console.error(JSON.stringify({event: 'unhandled_error', ...diagnostic}))
    },
    ...(assets ? { assets } : {}),
    ...(env.postMedia
      ? { postMediaAssets: createR2PostMediaPort(env.postMedia) }
      : {}),
    ...(env.dify ? { chat: createDifyChatPort(env.dify) } : {}),
    ...(analyticsWorker && env.analytics
      ? { analyticsWorker, analyticsCronSecret: env.analytics.cronSecret }
      : {}),
  };
}

export function createProductionApp(
  environment: Record<string, string | undefined> = process.env,
) {
  return createApp(createProductionDependencies(environment));
}
