import { Hono } from "hono";
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
import { registerInternalAnalyticsRoutes } from "./routes/internal-analytics.js";
import { registerCreatorRoutes } from "./routes/creator.js";
import { registerAdminCreatorRoutes } from "./routes/admin-creator.js";
import type { AuthVerifier } from "./ports/auth.js";
import type { AuthorityPort } from "./ports/authority.js";
import type { PlatformSocialPort } from "./ports/platform-social.js";
import type { ProfilePort } from "./ports/profiles.js";
import type { SocialPort } from "./ports/social.js";
import type { ChatPort } from "./ports/chat.js";
import type { ChatTargetPort } from "./ports/chat-target.js";
import type { AnalyticsDeliveryWorker } from "./ports/analytics.js";
import type { AssetPort, ImageGenerationPort } from "./ports/assets.js";
import type { CreatorPort, PlatformCreatorPort } from "./ports/creator.js";
import type { PostMediaAssetPort } from "./ports/post-media-assets.js";

export type AppDependencies = {
  auth?: AuthVerifier;
  authority?: AuthorityPort;
  platformSocial?: PlatformSocialPort;
  profiles?: ProfilePort;
  social?: SocialPort;
  chat?: ChatPort;
  chatTargets?: ChatTargetPort;
  analyticsWorker?: AnalyticsDeliveryWorker;
  analyticsCronSecret?: string;
  creator?: CreatorPort;
  platformCreator?: PlatformCreatorPort;
  assets?: AssetPort;
  imageGeneration?: ImageGenerationPort;
  postMediaAssets?: PostMediaAssetPort;
};

export const createApp = (dependencies: AppDependencies = {}) => {
  const app = new Hono<{ Variables: ApiVariables }>();

  app.use("*", requestIdMiddleware);
  registerHealthRoutes(app);
  registerAdminRoutes(app, dependencies);
  registerMeRoutes(app, dependencies);
  registerSocialRoutes(app, dependencies);
  registerChatRoutes(app, dependencies);
  registerInternalAnalyticsRoutes(app, dependencies);
  registerCreatorRoutes(app, dependencies);
  registerAdminCreatorRoutes(app, dependencies);
  app.notFound((c) => apiError(c, 404, "NOT_FOUND", "Route not found"));
  app.onError((_error, c) =>
    apiError(c, 500, "INTERNAL_ERROR", "Internal server error"),
  );

  return app;
};
