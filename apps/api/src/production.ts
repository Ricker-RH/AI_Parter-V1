import {createAnalyticsOutboxRepositoryFromUrl} from '@aifans/db'
import {createApp, type AppDependencies} from './app.js'
import {createDifyChatPort} from './adapters/dify-chat.js'
import {createNeonJwtAuthVerifier} from './adapters/neon-auth-jwt.js'
import {createPostHogAnalyticsCapture} from './adapters/posthog-analytics.js'
import {readApiEnv} from './env.js'
import {createAnalyticsDeliveryWorker} from './ports/analytics.js'
import {databaseAuthorityPort} from './ports/authority.database.js'
import {databaseChatTargetPort} from './ports/chat-target.database.js'
import {databasePlatformSocialPort} from './ports/platform-social.database.js'
import {databaseProfilePort} from './ports/profiles.database.js'
import {databaseSocialPort} from './ports/social.database.js'

export function createProductionDependencies(environment: Record<string, string | undefined> = process.env): AppDependencies {
  const env = readApiEnv(environment)
  const analyticsWorker = env.analytics
    ? createAnalyticsDeliveryWorker({
        outbox: createAnalyticsOutboxRepositoryFromUrl(env.analytics.databaseUrl),
        capture: createPostHogAnalyticsCapture({projectKey: env.analytics.projectKey, host: env.analytics.host}),
      })
    : undefined
  return {
    auth: createNeonJwtAuthVerifier(env.auth),
    authority: databaseAuthorityPort,
    platformSocial: databasePlatformSocialPort,
    profiles: databaseProfilePort,
    social: databaseSocialPort,
    chatTargets: databaseChatTargetPort,
    ...(env.dify ? {chat: createDifyChatPort(env.dify)} : {}),
    ...(analyticsWorker && env.analytics
      ? {analyticsWorker, analyticsCronSecret: env.analytics.cronSecret}
      : {}),
  }
}

export function createProductionApp(environment: Record<string, string | undefined> = process.env) {
  return createApp(createProductionDependencies(environment))
}
