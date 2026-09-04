import {
  createAnalyticsOutboxRepositoryFromUrl,
  createProfileAssetCleanupRepositoryFromUrl,
  createRateLimitRepositoryFromUrl,
  createReadinessProbeFromUrl,
  createDatabaseRuntimeRepositories,
  type DatabaseRuntimeRepositories,
  type DatabaseRuntimeUrls,
} from "@aifans/db";
import { createApp, type AppDependencies } from "./application.js";
import { createDifyChatPort } from "./adapters/dify-chat.js";
import {createRealtimeTickets} from './adapters/realtime-ticket.js'
import {createRealtimePublisher} from './adapters/realtime-publisher.js'
import {createRealtimeStatusReader} from './adapters/realtime-status.js'
import {createRealtimeEphemeral} from './ports/realtime-ephemeral.js'
import {createR2HumanChatMediaStorage} from './adapters/r2-human-chat-media.js'
import {createHumanChatMediaPort} from './ports/human-chat-media.js'
import {createRealtimeDeliveryWorker} from './ports/realtime-delivery.js'
import {groupRealtimeDeliveryWorkers} from './ports/realtime-delivery-group.js'
import type {RealtimePort} from './ports/realtime.js'
import {waitUntil} from '@vercel/functions'
import { createNeonJwtAuthVerifier } from "./adapters/neon-auth-jwt.js";
import { createPostHogAnalyticsCapture } from "./adapters/posthog-analytics.js";
import { r2AssetPortFromEnv } from "./adapters/r2-assets.js";
import { readApiEnv } from "./env.js";
import { createAnalyticsDeliveryWorker } from "./ports/analytics.js";
import { createR2PostMediaPort } from "./adapters/r2-post-media.js";
import {createR2ProfileAssetPort, createR2ProfileAssetCleanup} from './adapters/r2-profile-assets.js'
import {jsonConsoleLogger} from './ports/logger.js'
import type {RateLimitPort} from './ports/rate-limit.js'
import type {ReadinessPort} from './ports/readiness.js'

export type ProductionFactories = {
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
  const cleanupRepository = env.postMedia && env.profileAssetCleanupSecret
    ? createProfileAssetCleanupRepositoryFromUrl(env.databasePlatformUrl) : undefined
  const cleanupRemove = cleanupRepository && env.postMedia ? createR2ProfileAssetCleanup(env.postMedia) : undefined
  let realtime: RealtimePort | undefined
  if (env.realtime) {
    const sessions=database.realtimeSessions
    if (!sessions) throw new Error('Realtime session repository unavailable')
    const tickets=createRealtimeTickets({secret:env.realtime.ticketSecret,issuer:env.realtime.issuer,audience:env.realtime.audience,allowedOrigins:env.realtime.allowedOrigins,
      consume:(sessionId,expiresAt,identity,sessionExpiresAt,ticketIssuedAt)=>sessions.redeem({...identity,sessionId,ticketExpiresAt:expiresAt*1000,sessionExpiresAt,ticketIssuedAt}),
    })
    realtime={issue:(identity,origin)=>tickets.issue({...identity,origin}),redeem:({ticket,origin})=>tickets.consume(ticket,origin),authorize:input=>sessions.authorize(input)}
  }
  if(env.realtime?.gatewayUrl && (!database.humanRealtimeOutbox || !database.aiRealtimeOutbox)) throw new Error('Realtime outbox repository unavailable')
  const realtimeDelivery=env.realtime?.gatewayUrl && database.humanRealtimeOutbox
    ? groupRealtimeDeliveryWorkers([database.humanRealtimeOutbox,database.aiRealtimeOutbox!].map(outbox=>createRealtimeDeliveryWorker({outbox,publisher:createRealtimePublisher({baseUrl:env.realtime!.gatewayUrl!,secret:env.realtime!.internalSecret})}))) : undefined
  return {
    ...(realtimeDelivery?{realtimeDelivery,defer:waitUntil}:{}),
    ...(realtimeDelivery?{onGenerationPersisted:()=>{waitUntil(realtimeDelivery.deliverBatch(10).catch(()=>{console.error(JSON.stringify({event:'realtime_wakeup_failed'}))}))}}:{}),
    ...(env.realtime?.gatewayUrl&&database.realtimeEphemeral?{realtimeEphemeral:createRealtimeEphemeral({resolve:input=>database.realtimeEphemeral!.resolve(input),status:createRealtimeStatusReader({baseUrl:env.realtime.gatewayUrl,secret:env.realtime.internalSecret})})}:{}),
    ...(realtime && env.realtime ? {realtime,realtimeAllowedOrigins:env.realtime.allowedOrigins,realtimeInternalSecret:env.realtime.internalSecret} : {}),
    ...(cleanupRepository && cleanupRemove && env.profileAssetCleanupSecret ? {
      profileAssetCleanup: {run: () => cleanupRepository.cleanupBatch(cleanupRemove)},
      profileAssetCleanupSecret: env.profileAssetCleanupSecret,
    } : {}),
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
    conversations: database.chat,
    ...(env.humanSocialEnabled && database.humanChat ? {humanChat: database.humanChat} : {}),
    ...(env.humanSocialEnabled && env.privateChatMedia && database.humanChatMedia ? {humanChatMedia:createHumanChatMediaPort({repository:database.humanChatMedia,storage:createR2HumanChatMediaStorage(env.privateChatMedia)})}:{}),
    ...(env.humanSocialEnabled && database.humanSocial ? {humanSocial: database.humanSocial} : {}),
    ...(env.humanSocialEnabled && database.humanProfileTabs ? {humanProfileTabs: database.humanProfileTabs} : {}),
    ...(env.humanSocialEnabled && database.humanChatRichContent ? {humanChatRichContent:database.humanChatRichContent}:{}),
    realtimeRevocationEnabled:env.humanSocialEnabled,
    ...(env.humanSocialEnabled && database.realtimeRevocation ? {realtimeRevocation:database.realtimeRevocation}:{}),
    creator: database.creator,
    platformCreator: database.platformCreator,
    channels:database.channels,
    platformChannels:database.platformChannels,
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
      ? {
          postMediaAssets: createR2PostMediaPort(env.postMedia),
          profileAssets: createR2ProfileAssetPort(env.postMedia),
        }
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
