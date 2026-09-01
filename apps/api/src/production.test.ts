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
    } satisfies DatabaseRuntimeRepositories;
    const createDatabaseRuntime = vi.fn<ProductionFactories['createDatabaseRuntime']>(() => database);
    const dependencies = createProductionDependencies(publicR2, {createDatabaseRuntime});
    expect(dependencies.postMediaAssets).toBeDefined();
    expect(createDatabaseRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        publicMediaBaseUrl: "https://media.example/assets",
      }),
    );
  });
});
