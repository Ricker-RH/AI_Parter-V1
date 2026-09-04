import { Hono } from "hono";
import {bodyLimit} from 'hono/body-limit'
import { apiError } from "./errors.js";
import {
  requestIdMiddleware,
  type ApiVariables,
} from "./middleware/request-id.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerSocialRoutes } from "./routes/social.js";
import { registerChatRoutes } from "./routes/chat.js";
import {registerHumanChatRoutes} from './routes/human-chat.js'
import type {HumanChatPort} from './ports/human-chat.js'
import {registerRealtimeRoutes} from './routes/realtime.js'
import type {RealtimePort} from './ports/realtime.js'
import { registerInternalAnalyticsRoutes } from "./routes/internal-analytics.js";
import { registerCreatorRoutes } from "./routes/creator.js";
import { registerAdminCreatorRoutes } from "./routes/admin-creator.js";
import {registerChannelRoutes} from './routes/channels.js'
import {registerAdminChannelRoutes} from './routes/admin-channels.js'
import {registerInternalProfileAssetRoutes, type ProfileAssetCleanupWorker} from './routes/internal-profile-assets.js'
import type { AuthVerifier } from "./ports/auth.js";
import type { AuthorityPort } from "./ports/authority.js";
import type { PlatformSocialPort } from "./ports/platform-social.js";
import type { ProfilePort } from "./ports/profiles.js";
import type { SocialPort } from "./ports/social.js";
import type { ChatPort } from "./ports/chat.js";
import type { ChatTargetPort } from "./ports/chat-target.js";
import type {ChatRepositoryPort} from './ports/chat-repository.js'
import type { AnalyticsDeliveryWorker } from "./ports/analytics.js";
import type { AssetPort, ImageGenerationPort } from "./ports/assets.js";
import type { CreatorPort, PlatformCreatorPort } from "./ports/creator.js";
import type { PostMediaAssetPort } from "./ports/post-media-assets.js";
import type {ProfileAssetPort} from './ports/profile-assets.js'
import type {RateLimitPort} from './ports/rate-limit.js'
import type {ReadinessPort} from './ports/readiness.js'
import type {StructuredLogger} from './ports/logger.js'
import {rateLimitMiddleware} from './middleware/rate-limit.js'
import {structuredLoggerMiddleware} from './middleware/structured-logger.js'
import type {ChannelPort,PlatformChannelPort} from './ports/channels.js'

export type UnhandledErrorDiagnostic = {name: string; code?: string; requestId?: string; conversationId?: string}

export type AppDependencies = {
  auth?: AuthVerifier;
  authority?: AuthorityPort;
  platformSocial?: PlatformSocialPort;
  profiles?: ProfilePort;
  social?: SocialPort;
  chat?: ChatPort;
  humanChat?: HumanChatPort;
  realtime?: RealtimePort;
  realtimeAllowedOrigins?: string[];
  realtimeInternalSecret?: string;
  chatTargets?: ChatTargetPort;
  conversations?: ChatRepositoryPort;
  analyticsWorker?: AnalyticsDeliveryWorker;
  analyticsCronSecret?: string;
  creator?: CreatorPort;
  platformCreator?: PlatformCreatorPort;
  assets?: AssetPort;
  imageGeneration?: ImageGenerationPort;
  postMediaAssets?: PostMediaAssetPort;
  profileAssets?: ProfileAssetPort;
  profileAssetCleanup?: ProfileAssetCleanupWorker;
  profileAssetCleanupSecret?: string;
  rateLimit?:RateLimitPort;
  rateLimitHmacSecret?:string;
  rateLimitIdentitySecret?:string;
  requireRateLimit?:boolean;
  readiness?:ReadinessPort;
  logger?:StructuredLogger;
  channels?:ChannelPort;
  platformChannels?:PlatformChannelPort;
  onUnhandledError?: (diagnostic: UnhandledErrorDiagnostic) => void;
};

function unhandledErrorDiagnostic(error: unknown): UnhandledErrorDiagnostic {
  if (typeof error !== 'object' || error === null) return {name: 'Unknown'}
  const candidate = error as {name?: unknown; code?: unknown}
  return {
    name: typeof candidate.name === 'string' ? candidate.name : 'Error',
    ...(typeof candidate.code === 'string' ? {code: candidate.code} : {}),
  }
}

export const createApp = (dependencies: AppDependencies = {}) => {
  const app = new Hono<{ Variables: ApiVariables }>();

  app.use("*", requestIdMiddleware);
  app.use('*', async (c, next) => {
    if (/^\/v1\/(?:human-chat|realtime\/ticket|internal\/realtime)(?:\/|$)/.test(new URL(c.req.url).pathname)) c.header('Cache-Control', 'private, no-store')
    await next()
  })
  if(dependencies.logger) app.use('*',structuredLoggerMiddleware(dependencies.logger))
  const globalBodyLimit=bodyLimit({maxSize:65_536,onError:(c)=>apiError(c,413,'PAYLOAD_TOO_LARGE','Request body is too large')})
  app.use('*',(c,next)=>/^\/v1\/admin\/(?:ips|posts|post-media)(?:\/|$)/.test(new URL(c.req.url).pathname)?next():globalBodyLimit(c,next))
  app.use('*',rateLimitMiddleware({...(dependencies.rateLimit?{port:dependencies.rateLimit}:{}),...(dependencies.rateLimitHmacSecret?{hmacSecret:dependencies.rateLimitHmacSecret}:{}),...(dependencies.rateLimitIdentitySecret?{identitySecret:dependencies.rateLimitIdentitySecret}:{}),required:dependencies.requireRateLimit===true}))
  registerHealthRoutes(app,dependencies.readiness);
  registerAdminRoutes(app, dependencies);
  registerMeRoutes(app, dependencies);
  registerSocialRoutes(app, dependencies);
  registerChatRoutes(app, dependencies);
  registerHumanChatRoutes(app, dependencies);
  registerRealtimeRoutes(app, dependencies);
  registerInternalAnalyticsRoutes(app, dependencies);
  registerInternalProfileAssetRoutes(app, dependencies);
  registerCreatorRoutes(app, dependencies);
  registerAdminCreatorRoutes(app, dependencies);
  registerChannelRoutes(app,dependencies)
  registerAdminChannelRoutes(app,dependencies)
  app.notFound((c) => apiError(c, 404, "NOT_FOUND", "Route not found"));
  app.onError((error, c) => {
    dependencies.onUnhandledError?.(unhandledErrorDiagnostic(error));
    return apiError(c, 500, "INTERNAL_ERROR", "Internal server error");
  });

  return app;
};
