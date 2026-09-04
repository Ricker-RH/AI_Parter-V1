import { describe, expect, it, vi } from "vitest";
import type {DatabaseRuntimeRepositories} from '@aifans/db'
import {
  createProductionApp,
  createProductionDependencies,
  type ProductionFactories,
} from "./production.js";

const environment = {
  DATABASE_USER_URL: "postgresql://user:secret@db.example/aifans",
  DATABASE_PLATFORM_URL: "postgresql://platform:secret@db.example/aifans",
  DATABASE_PROVISIONING_URL:
    "postgresql://provisioner:secret@db.example/aifans",
  NEON_AUTH_JWKS_URL: "https://auth.example/.well-known/jwks.json",
  NEON_AUTH_ISSUER: "https://auth.example",
  NEON_AUTH_AUDIENCE: "aifans-api",
  WEB_API_RATE_LIMIT_SIGNING_SECRET: "w".repeat(32),
} as const;

describe("production API composition", () => {
  it('keeps human chat opt-in until its migration is deployed', () => {
    expect(createProductionDependencies(environment).humanChat).toBeUndefined()
    expect(createProductionDependencies({...environment, HUMAN_SOCIAL_ENABLED: 'true'}).humanChat?.send).toBeTypeOf('function')
    expect(createProductionDependencies({...environment, HUMAN_SOCIAL_ENABLED: 'true'}).humanSocial?.getPublicProfile).toBeTypeOf('function')
    expect(createProductionDependencies({...environment, HUMAN_SOCIAL_ENABLED: 'true'}).humanProfileTabs?.getTab).toBeTypeOf('function')
  })
  it('binds ticket redemption to the durable session repository with millisecond expiry', async () => {
    const base=createProductionDependencies(environment)
    const redeem=vi.fn().mockResolvedValue(true)
    const authorize=vi.fn().mockResolvedValue({allowed:true,presenceAllowed:false})
    const configured={...environment,HUMAN_SOCIAL_ENABLED:'true',REALTIME_TICKET_SECRET:'t'.repeat(32),REALTIME_INTERNAL_SECRET:'i'.repeat(32),REALTIME_ISSUER:'aifans-test',REALTIME_AUDIENCE:'gateway-test',REALTIME_ALLOWED_ORIGINS:'https://web.example'}
    const createDatabaseRuntime=()=>({authority:base.authority,platformSocial:base.platformSocial,profiles:base.profiles,social:base.social,chatTargets:base.chatTargets,chat:base.conversations,creator:base.creator,platformCreator:base.platformCreator,channels:base.channels,platformChannels:base.platformChannels,realtimeSessions:{redeem,authorize}} as DatabaseRuntimeRepositories)
    const deps=createProductionDependencies(configured,{createDatabaseRuntime})
    expect(deps.realtime).toBeDefined()
    const identity={subject:'auth-user',profileId:'00000000-0000-4000-8000-000000000001'}
    const ticket=await deps.realtime!.issue(identity,'https://web.example')
    const session=await deps.realtime!.redeem({ticket,origin:'https://web.example'})
    expect(redeem).toHaveBeenCalledWith({...identity,sessionId:session.sessionId,ticketExpiresAt:expect.any(Number),sessionExpiresAt:session.sessionExpiresAt})
    expect(redeem.mock.calls[0]![0].ticketExpiresAt).toBeGreaterThan(Date.now())
    await deps.realtime!.authorize({...session,conversationId:'00000000-0000-4000-8000-000000000002'})
    expect(authorize).toHaveBeenCalledOnce()
    expect(deps.realtimeInternalSecret).toBe(configured.REALTIME_INTERNAL_SECRET)
    expect(base.realtime).toBeUndefined()
    expect(createProductionDependencies({...configured,REALTIME_GATEWAY_URL:'https://gateway.example'}).realtimeDelivery?.deliverBatch).toBeTypeOf('function')
    expect(()=>createProductionDependencies(configured,{createDatabaseRuntime:()=>({...createDatabaseRuntime(),realtimeSessions:undefined})})).toThrow('Realtime session repository unavailable')
  })
  it('enables profile cleanup only with its explicit secret and public R2 configuration', () => {
    expect(createProductionDependencies(environment).profileAssetCleanup).toBeUndefined()
    expect(() => createProductionDependencies({...environment, PROFILE_ASSET_CLEANUP_SECRET: 'x'})).toThrow('Invalid API environment')
    const configured = createProductionDependencies({...environment,
      PROFILE_ASSET_CLEANUP_SECRET: 'x'.repeat(32),
      R2_ACCOUNT_ID: '0'.repeat(32), R2_ACCESS_KEY_ID: 'access', R2_SECRET_ACCESS_KEY: 'secret',
      R2_PUBLIC_BUCKET: 'public-media', R2_PUBLIC_BASE_URL: 'https://media.example',
    })
    expect(configured.profileAssetCleanup?.run).toBeTypeOf('function')
    expect(configured.profileAssetCleanupSecret).toBe('x'.repeat(32))
  })
  it("injects every P0 runtime port without configuring optional chat", () => {
    const database = {
      authority: {} as DatabaseRuntimeRepositories['authority'],
      platformSocial: {} as DatabaseRuntimeRepositories['platformSocial'],
      profiles: {} as DatabaseRuntimeRepositories['profiles'],
      social: {} as DatabaseRuntimeRepositories['social'],
      chatTargets: {} as DatabaseRuntimeRepositories['chatTargets'],
      chat: {} as DatabaseRuntimeRepositories['chat'],
      creator: {} as DatabaseRuntimeRepositories['creator'],
      platformCreator: {} as DatabaseRuntimeRepositories['platformCreator'],
      channels: {} as DatabaseRuntimeRepositories['channels'],
      platformChannels: {} as DatabaseRuntimeRepositories['platformChannels'],
    } satisfies DatabaseRuntimeRepositories
    const createDatabaseRuntime = (() => database) satisfies ProductionFactories['createDatabaseRuntime']
    const dependencies = createProductionDependencies(environment, {createDatabaseRuntime})
    expect(dependencies).toMatchObject({
      auth: expect.any(Object),
      authority: expect.any(Object),
      platformSocial: expect.any(Object),
      profiles: expect.any(Object),
      social: expect.any(Object),
      chatTargets: expect.any(Object),
      conversations: expect.any(Object),
      creator: expect.any(Object),
      platformCreator: expect.any(Object),
      channels: expect.any(Object),
      platformChannels: expect.any(Object),
    });
    expect(dependencies.conversations).toBe(database.chat)
    expect(dependencies.chat).toBeUndefined();
    expect(dependencies.assets).toBeUndefined();
  });

  it('passes the configured Web-to-API identity secret to production middleware', () => {
    expect(createProductionDependencies(environment)).toMatchObject({rateLimitIdentitySecret: environment.WEB_API_RATE_LIMIT_SIGNING_SECRET})
  })

  it("fails startup before serving when required configuration is absent", () => {
    expect(() => createProductionApp({})).toThrow("Invalid API environment");
  });

  it("exports a live Hono app with public health and strict auth", async () => {
    const app = createProductionApp(environment);
    expect((await app.request("/health")).status).toBe(200);
    const response = await app.request("/v1/me", {
      headers: { authorization: "Bearer malformed" },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "AUTH_INVALID" });
  });

  it("binds database repositories to the explicitly parsed environment instead of process.env", () => {
    const database = {
      authority: {} as DatabaseRuntimeRepositories['authority'],
      platformSocial: {} as DatabaseRuntimeRepositories['platformSocial'],
      profiles: {} as DatabaseRuntimeRepositories['profiles'],
      social: {} as DatabaseRuntimeRepositories['social'],
      chatTargets: {} as DatabaseRuntimeRepositories['chatTargets'],
      chat: {} as DatabaseRuntimeRepositories['chat'],
      creator: {} as DatabaseRuntimeRepositories['creator'],
      platformCreator: {} as DatabaseRuntimeRepositories['platformCreator'],
      channels: {} as DatabaseRuntimeRepositories['channels'],
      platformChannels: {} as DatabaseRuntimeRepositories['platformChannels'],
    } satisfies DatabaseRuntimeRepositories;
    const createDatabaseRuntime = vi.fn<ProductionFactories['createDatabaseRuntime']>(() => database);
    const previous = process.env.DATABASE_USER_URL;
    process.env.DATABASE_USER_URL =
      "postgresql://wrong:wrong@process.example/wrong";
    try {
      const dependencies = createProductionDependencies(environment, {createDatabaseRuntime});
      expect(createDatabaseRuntime).toHaveBeenCalledWith({
        userUrl: environment.DATABASE_USER_URL,
        platformUrl: environment.DATABASE_PLATFORM_URL,
        provisioningUrl: environment.DATABASE_PROVISIONING_URL,
      });
      expect(dependencies).toMatchObject({
        authority: database.authority,
        platformSocial: database.platformSocial,
        profiles: database.profiles,
        social: database.social,
        chatTargets: database.chatTargets,
        conversations: database.chat,
        creator: database.creator,
        platformCreator: database.platformCreator,
        channels: database.channels,
        platformChannels: database.platformChannels,
      });
      expect(dependencies.chat).toBeUndefined()
    } finally {
      if (previous === undefined) delete process.env.DATABASE_USER_URL;
      else process.env.DATABASE_USER_URL = previous;
    }
  });

  it("configures private R2 assets only from a complete server environment", () => {
    const r2Environment = {
      ...environment,
      R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      R2_ACCESS_KEY_ID: "access-key",
      R2_SECRET_ACCESS_KEY: "secret-key",
      R2_PRIVATE_BUCKET: "aifans-private",
    };
    expect(createProductionDependencies(r2Environment).assets).toBeDefined();
    expect(() =>
      createProductionDependencies({
        ...environment,
        R2_ACCOUNT_ID: r2Environment.R2_ACCOUNT_ID,
      }),
    ).toThrow("Invalid API environment");
  });
  it("injects public post media and the exact public base into database projections only when fully configured", () => {
    const publicR2 = {
      ...environment,
      R2_ACCOUNT_ID: "0".repeat(32),
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_PUBLIC_BUCKET: "aifans-public",
      R2_PUBLIC_BASE_URL: "https://media.example/assets/",
    };
    const database = {
      authority: {} as DatabaseRuntimeRepositories['authority'],
      platformSocial: {} as DatabaseRuntimeRepositories['platformSocial'],
      profiles: {} as DatabaseRuntimeRepositories['profiles'],
      social: {} as DatabaseRuntimeRepositories['social'],
      chatTargets: {} as DatabaseRuntimeRepositories['chatTargets'],
      chat: {} as DatabaseRuntimeRepositories['chat'],
      creator: {} as DatabaseRuntimeRepositories['creator'],
      platformCreator: {} as DatabaseRuntimeRepositories['platformCreator'],
      channels: {} as DatabaseRuntimeRepositories['channels'],
      platformChannels: {} as DatabaseRuntimeRepositories['platformChannels'],
    } satisfies DatabaseRuntimeRepositories;
    const createDatabaseRuntime = vi.fn<ProductionFactories['createDatabaseRuntime']>(() => database);
    const dependencies = createProductionDependencies(publicR2, {createDatabaseRuntime});
    expect(dependencies.postMediaAssets).toBeDefined();
    expect(dependencies.profileAssets).toBeDefined();
    expect(createDatabaseRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        publicMediaBaseUrl: "https://media.example/assets",
      }),
    );
  });

  it('leaves profile asset storage unconfigured without public R2 while keeping profile routes available', async () => {
    const dependencies = createProductionDependencies(environment)
    expect(dependencies.profileAssets).toBeUndefined()
    const app = createProductionApp(environment)
    expect((await app.request('/v1/me', {headers: {authorization: 'Bearer malformed'}})).status).toBe(401)
  })
});
