import { Pool } from "@neondatabase/serverless";
import {
  createAuthorityRepository,
  type AuthorityRepository,
} from "./authority.js";
import {
  createChatTargetRepository,
  type ChatTargetRepository,
} from "./chat-target.js";
import { createChatRepository, type ChatRepository } from "./chat.js";
import {createHumanChatRepository, type HumanChatRepository} from './human-chat.js'
import {createHumanSocialRepository, type HumanSocialRepository} from './human-social.js'
import {createPostgresRealtimeSessionRepository, type RealtimeSessionRepository} from './realtime-sessions.js'
import {createPostgresHumanRealtimeOutboxRepository,type HumanRealtimeOutboxRepository} from './human-realtime-outbox.js'
import {createHumanProfileTabsRepository,type HumanProfileTabsRepository} from './human-profile-tabs.js'
import {createHumanChatMediaRepository,type HumanChatMediaRepository} from './human-chat-media.js'
import {createHumanChatRichContentRepository,type HumanChatRichContentRepository} from './human-chat-rich-content.js'
import {createRealtimeRevocationRepository} from './realtime-revocation.js'
import {createPostgresAiRealtimeOutboxRepository,type AiRealtimeOutboxRepository} from './ai-realtime-outbox.js'
import {createPostgresRealtimeEphemeralRepository} from './realtime-ephemeral.js'
import { createProfileRepository, type ProfileRepository } from "./profiles.js";
import {
  createCreatorRepository,
  createPlatformCreatorRepository,
  type CreatorRepository,
  type PlatformCreatorRepository,
} from "./creator.js";
import {
  createPlatformSocialRepository,
  createSocialRepository,
  type PlatformSocialRepository,
  type SocialRepository,
} from "./social.js";
import {
  createActorSession,
  createPlatformSession,
  type QueryClient,
} from "./session.js";
import {createChannelRepository,createPlatformChannelRepository,type ChannelRepository,type PlatformChannelRepository} from './channels.js'

export type DatabaseRuntimeUrls = {
  userUrl: string;
  platformUrl: string;
  provisioningUrl: string;
  publicMediaBaseUrl?: string;
};

export type DatabaseRuntimeRepositories = {
  authority: AuthorityRepository;
  platformSocial: PlatformSocialRepository;
  profiles: ProfileRepository;
  social: SocialRepository;
  chatTargets: ChatTargetRepository;
  chat: ChatRepository;
  humanChat?: HumanChatRepository;
  humanSocial?: HumanSocialRepository;
  realtimeSessions?: RealtimeSessionRepository;
  humanRealtimeOutbox?: HumanRealtimeOutboxRepository;
  humanProfileTabs?: HumanProfileTabsRepository;
  humanChatMedia?:HumanChatMediaRepository;
  humanChatRichContent?:HumanChatRichContentRepository;
  realtimeRevocation?:ReturnType<typeof createRealtimeRevocationRepository>;
  aiRealtimeOutbox?:AiRealtimeOutboxRepository;
  realtimeEphemeral?:ReturnType<typeof createPostgresRealtimeEphemeralRepository>;
  creator: CreatorRepository;
  platformCreator: PlatformCreatorRepository;
  channels: ChannelRepository;
  platformChannels: PlatformChannelRepository;
};

function postgresUrl(value: string): string {
  const protocol = new URL(value).protocol;
  if (protocol !== "postgres:" && protocol !== "postgresql:")
    throw new Error("Database runtime URL must use postgres");
  return value;
}

export function createDatabaseRuntimeRepositories(
  urls: DatabaseRuntimeUrls,
): DatabaseRuntimeRepositories {
  const userPool = new Pool({ connectionString: postgresUrl(urls.userUrl) });
  const platformPool = new Pool({
    connectionString: postgresUrl(urls.platformUrl),
  });
  const provisioningPool = new Pool({
    connectionString: postgresUrl(urls.provisioningUrl),
  });
  const { withActor } = createActorSession(userPool);
  const { withPlatformActor } = createPlatformSession(platformPool);
  const withPublic = async <T>(
    callback: (client: QueryClient) => Promise<T>,
  ): Promise<T> => {
    const client = await userPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE aifans_anon");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };
  return {
    authority: createAuthorityRepository({ withActor }),
    platformSocial: createPlatformSocialRepository({
      withPlatformActor,
      ...(urls.publicMediaBaseUrl
        ? { publicMediaBaseUrl: urls.publicMediaBaseUrl }
        : {}),
    }),
    profiles: createProfileRepository({
      adminPool: provisioningPool,
      withActor,
      ...(urls.publicMediaBaseUrl
        ? {publicMediaBaseUrl: urls.publicMediaBaseUrl}
        : {}),
    }),
    social: createSocialRepository({
      withActor,
      withPublic,
      ...(urls.publicMediaBaseUrl
        ? { publicMediaBaseUrl: urls.publicMediaBaseUrl }
        : {}),
    }),
    chatTargets: createChatTargetRepository(withActor),
    chat: createChatRepository(withActor),
    humanChat: createHumanChatRepository({withActor,...(urls.publicMediaBaseUrl?{publicMediaBaseUrl:urls.publicMediaBaseUrl}:{})}),
    realtimeSessions: createPostgresRealtimeSessionRepository({withPlatformActor}),
    humanRealtimeOutbox: createPostgresHumanRealtimeOutboxRepository({withPlatformActor}),
    humanChatMedia:createHumanChatMediaRepository({withActor,withPlatformActor}),
    humanChatRichContent:createHumanChatRichContentRepository({withActor,...(urls.publicMediaBaseUrl?{publicMediaBaseUrl:urls.publicMediaBaseUrl}:{})}),
    realtimeRevocation:createRealtimeRevocationRepository({withActor}),
    aiRealtimeOutbox:createPostgresAiRealtimeOutboxRepository({withPlatformActor}),
    realtimeEphemeral:createPostgresRealtimeEphemeralRepository({withPlatformActor}),
    humanProfileTabs: createHumanProfileTabsRepository({withActor,withPublic,...(urls.publicMediaBaseUrl?{publicMediaBaseUrl:urls.publicMediaBaseUrl}:{})}),
    humanSocial: createHumanSocialRepository({withActor,withPublic,...(urls.publicMediaBaseUrl?{publicMediaBaseUrl:urls.publicMediaBaseUrl}:{})}),
    creator: createCreatorRepository({ withActor }),
    platformCreator: createPlatformCreatorRepository({ withPlatformActor }),
    channels: createChannelRepository({withPublic,...(urls.publicMediaBaseUrl?{publicMediaBaseUrl:urls.publicMediaBaseUrl}:{})}),
    platformChannels: createPlatformChannelRepository({withPlatformActor,...(urls.publicMediaBaseUrl?{publicMediaBaseUrl:urls.publicMediaBaseUrl}:{})}),
  };
}
