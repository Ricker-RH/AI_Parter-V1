import { describe, expect, it } from "vitest";
import { readApiEnv } from "./env.js";

const valid = {
  DATABASE_USER_URL: "postgresql://user:secret@db.example/aifans",
  DATABASE_PLATFORM_URL: "postgresql://platform:secret@db.example/aifans",
  DATABASE_PROVISIONING_URL:
    "postgresql://provisioner:secret@db.example/aifans",
  NEON_AUTH_JWKS_URL: "https://auth.example/.well-known/jwks.json",
  NEON_AUTH_ISSUER: "https://auth.example",
  NEON_AUTH_AUDIENCE: "aifans-api",
  WEB_API_RATE_LIMIT_SIGNING_SECRET: "w".repeat(32),
} as const;

describe("API production environment", () => {
  it('requires complete, separate realtime credentials and exact HTTPS origins', () => {
    const realtime = {
      HUMAN_SOCIAL_ENABLED: 'true', REALTIME_TICKET_SECRET: 't'.repeat(32),
      REALTIME_INTERNAL_SECRET: 'i'.repeat(32), REALTIME_ISSUER: 'aifans-test',
      REALTIME_AUDIENCE: 'aifans-gateway-test', REALTIME_ALLOWED_ORIGINS: 'https://web.example,https://preview.example',
    }
    expect(readApiEnv({...valid,...realtime}).realtime).toMatchObject({allowedOrigins:['https://web.example','https://preview.example']})
    expect(readApiEnv(valid).realtime).toBeUndefined()
    expect(readApiEnv({...valid,...realtime,REALTIME_GATEWAY_URL:'https://gateway.example'}).realtime?.gatewayUrl).toBe('https://gateway.example')
    expect(()=>readApiEnv({...valid,REALTIME_GATEWAY_URL:'https://gateway.example'})).toThrow('Invalid API environment')
    expect(()=>readApiEnv({...valid,...realtime,REALTIME_GATEWAY_URL:'https://gateway.example/path'})).toThrow('Invalid API environment')
    for (const key of Object.keys(realtime).filter(key=>key!=='HUMAN_SOCIAL_ENABLED')) {
      expect(()=>readApiEnv({...valid,...realtime,[key]:undefined})).toThrow('Invalid API environment')
    }
    for (const origins of ['*','http://web.example','https://web.example/path','https://user:secret@web.example','https://web.example,']) {
      expect(()=>readApiEnv({...valid,...realtime,REALTIME_ALLOWED_ORIGINS:origins})).toThrow('Invalid API environment')
    }
    expect(()=>readApiEnv({...valid,...realtime,REALTIME_INTERNAL_SECRET:realtime.REALTIME_TICKET_SECRET})).toThrow('Invalid API environment')
    expect(()=>readApiEnv({...valid,...realtime,HUMAN_SOCIAL_ENABLED:'false'})).toThrow('Invalid API environment')
    for(const secret of [' '.repeat(32),` ${'s'.repeat(32)}`,`${'s'.repeat(32)} `]) expect(()=>readApiEnv({...valid,...realtime,REALTIME_INTERNAL_SECRET:secret})).toThrow('Invalid API environment')
    for(const secret of [' '.repeat(32),` ${'s'.repeat(32)}`,`${'s'.repeat(32)} `]) expect(()=>readApiEnv({...valid,...realtime,REALTIME_TICKET_SECRET:secret})).toThrow('Invalid API environment')
  })
  it("accepts the three least-privilege database roles and strict auth metadata", () => {
    expect(readApiEnv(valid)).toMatchObject({
      databaseUserUrl: valid.DATABASE_USER_URL,
      databasePlatformUrl: valid.DATABASE_PLATFORM_URL,
      databaseProvisioningUrl: valid.DATABASE_PROVISIONING_URL,
      auth: {
        jwksUrl: valid.NEON_AUTH_JWKS_URL,
        issuer: valid.NEON_AUTH_ISSUER,
        audience: valid.NEON_AUTH_AUDIENCE,
      },
    });
  });

  it.each([
    "DATABASE_USER_URL",
    "DATABASE_PLATFORM_URL",
    "DATABASE_PROVISIONING_URL",
    "NEON_AUTH_JWKS_URL",
    "NEON_AUTH_ISSUER",
    "NEON_AUTH_AUDIENCE",
  ] as const)("fails closed when %s is missing", (name) => {
    expect(() => readApiEnv({ ...valid, [name]: undefined })).toThrow(
      "Invalid API environment",
    );
  });

  it("rejects insecure remote auth endpoints without echoing their value", () => {
    const secretUrl = "http://auth.example/private-token";
    expect(() =>
      readApiEnv({ ...valid, NEON_AUTH_JWKS_URL: secretUrl }),
    ).toThrow("Invalid API environment");
    try {
      readApiEnv({ ...valid, NEON_AUTH_JWKS_URL: secretUrl });
    } catch (error) {
      expect(String(error)).not.toContain(secretUrl);
    }
  });

  it('requires a minimum-length server-only Web-to-API signing secret', () => {
    expect(() => readApiEnv({...valid, WEB_API_RATE_LIMIT_SIGNING_SECRET: undefined})).toThrow('Invalid API environment')
    expect(() => readApiEnv({...valid, WEB_API_RATE_LIMIT_SIGNING_SECRET: 'short'})).toThrow('Invalid API environment')
  })

  it("accepts analytics delivery only as a complete server-only configuration", () => {
    expect(
      readApiEnv({
        ...valid,
        DATABASE_ANALYTICS_URL:
          "postgresql://analytics:secret@db.example/aifans",
        POSTHOG_API_KEY: "phc_project",
        POSTHOG_HOST: "https://us.i.posthog.com",
        ANALYTICS_CRON_SECRET: "x".repeat(32),
      }).analytics,
    ).toEqual({
      databaseUrl: "postgresql://analytics:secret@db.example/aifans",
      projectKey: "phc_project",
      host: "https://us.i.posthog.com",
      cronSecret: "x".repeat(32),
    });
    expect(() =>
      readApiEnv({ ...valid, POSTHOG_API_KEY: "phc_project" }),
    ).toThrow("Invalid API environment");
    expect(() =>
      readApiEnv({
        ...valid,
        POSTHOG_API_KEY: "phc_project",
        POSTHOG_HOST: "https://us.i.posthog.com",
        ANALYTICS_CRON_SECRET: "x".repeat(32),
      }),
    ).toThrow("Invalid API environment");
  });
  it("accepts public post media only with a complete strict server R2 configuration", () => {
    const media = {
      R2_ACCOUNT_ID: "0".repeat(32),
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_PUBLIC_BUCKET: "aifans-public",
      R2_PUBLIC_BASE_URL: "https://media.example/assets/",
    };
    expect(readApiEnv({ ...valid, ...media }).postMedia).toMatchObject({
      bucket: "aifans-public",
      publicBaseUrl: "https://media.example/assets",
    });
    expect(() =>
      readApiEnv({ ...valid, R2_PUBLIC_BUCKET: "aifans-public" }),
    ).toThrow("Invalid API environment");
    expect(() =>
      readApiEnv({
        ...valid,
        ...media,
        R2_PUBLIC_BASE_URL: "https://user:secret@media.example",
      }),
    ).toThrow("Invalid API environment");
  });
});
