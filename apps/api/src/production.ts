import {
  createAnalyticsOutboxRepositoryFromUrl,
  createDatabaseRuntimeRepositories,
  type DatabaseRuntimeRepositories,
  type DatabaseRuntimeUrls,
} from "@aifans/db";
import { createApp, type AppDependencies } from "./app.js";
import { createDifyChatPort } from "./adapters/dify-chat.js";
import { createNeonJwtAuthVerifier } from "./adapters/neon-auth-jwt.js";
import { createPostHogAnalyticsCapture } from "./adapters/posthog-analytics.js";
import { r2AssetPortFromEnv } from "./adapters/r2-assets.js";
import { readApiEnv } from "./env.js";
import { createAnalyticsDeliveryWorker } from "./ports/analytics.js";
import { createR2PostMediaPort } from "./adapters/r2-post-media.js";

type ProductionFactories = {
  createDatabaseRuntime(urls: DatabaseRuntimeUrls): DatabaseRuntimeRepositories;
};

const productionFactories: ProductionFactories = {
  createDatabaseRuntime: createDatabaseRuntimeRepositories,
};

export function createProductionDependencies(
  environment: Record<string, string | undefined> = process.env,
  factories: ProductionFactories = productionFactories,
): AppDependencies {
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
  return {
    auth: createNeonJwtAuthVerifier(env.auth),
    authority: database.authority,
    platformSocial: database.platformSocial,
    profiles: database.profiles,
    social: database.social,
    chatTargets: database.chatTargets,
    creator: database.creator,
    platformCreator: database.platformCreator,
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
