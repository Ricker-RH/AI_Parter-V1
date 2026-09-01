import { randomUUID } from "node:crypto";
import {
  ApiErrorSchema,
  CreateIpCommentResponseSchema,
  CreateIpResponseSchema,
  CreatePostResponseSchema,
} from "@aifans/contracts";
import { describe, expect, it } from "vitest";
import { createApp } from "../application.js";
import type { AuthVerifier } from "../ports/auth.js";
import { databaseAuthorityPort } from "../ports/authority.database.js";
import type { AuthorityPort } from "../ports/authority.js";
import type { PlatformSocialPort } from "../ports/platform-social.js";
import type { ProfilePort } from "../ports/profiles.js";

const subject = "verified_operator_subject";
const postId = randomUUID();
const ipProfileId = randomUUID();
const parentCommentId = randomUUID();
const createdAt = "2026-09-01T12:00:00.000Z";
const identity = {
  subject,
  email: "operator@example.com",
  displayName: "Operator",
};
const validAuth = {
  verify: async () => ({ status: "authenticated", identity }) as const,
} satisfies AuthVerifier;
const missingAuth = {
  verify: async () => ({ status: "missing" }) as const,
} satisfies AuthVerifier;
const invalidAuth = {
  verify: async () => ({ status: "invalid" }) as const,
} satisfies AuthVerifier;
const account = {
  id: randomUUID(),
  kind: "human" as const,
  username: "operator",
  displayName: "Operator",
  preferredLocale: "en" as const,
  creatorModeEnabled: false,
};
const ip = CreateIpResponseSchema.parse({
  kind: "ip",
  id: ipProfileId,
  username: "luna_ip",
  displayName: "Luna",
  bio: "Public",
  languages: ["en"],
  visualType: "hybrid",
});
const post = CreatePostResponseSchema.parse({
  id: postId,
  body: "Hello",
  languageCode: "en",
  publishedAt: createdAt,
  author: ip,
  likeCount: 0,
  commentCount: 0,
});
const comment = CreateIpCommentResponseSchema.parse({
  id: randomUUID(),
  postId,
  parentCommentId: null,
  author: ip,
  state: "published",
  body: "Reply",
  createdAt,
});

function profiles(overrides: Partial<ProfilePort> = {}): ProfilePort {
  return {
    reservePostMedia: async (input) => ({
      id: input.reservationId,
      objectKey: `public/posts/${input.reservationId}.png`,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expiresAt: input.expiresAt,
    }),
    getPostMediaReservation: async () => null,
    verifyPostMedia: async () => true,
    ensureHumanProfile: async () => undefined,
    getCurrentAccount: async () => account,
    ...overrides,
  };
}

function authority(isOperator = true, calls: unknown[] = []): AuthorityPort {
  return {
    isCurrentActorOperator: async (actor) => {
      calls.push(actor);
      return isOperator;
    },
  };
}

function platform(
  overrides: Partial<PlatformSocialPort> = {},
): PlatformSocialPort {
  return {
    createIp: async () => ip,
    publishPost: async () => post,
    publishIpComment: async () => comment,
    ...overrides,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    auth: validAuth,
    profiles: profiles(),
    authority: authority(),
    platformSocial: platform(),
    ...overrides,
  };
}

async function expectError(response: Response, status: number, code: string) {
  const requestId = response.headers.get("x-request-id");
  const body = ApiErrorSchema.parse(await response.json());
  expect(response.status).toBe(status);
  expect(body).toMatchObject({ code, requestId });
}

const requests = [
  [
    "/v1/admin/ips",
    {
      username: "luna_ip",
      displayName: " Luna ",
      bio: " Public ",
      languageCodes: ["en"],
    },
  ],
  ["/v1/admin/posts", { ipProfileId, body: " Hello ", languageCode: "en" }],
  [
    `/v1/admin/posts/${postId}/comments`,
    { ipProfileId, body: " Reply ", parentCommentId },
  ],
] as const;

describe("operator authorization", () => {
  it.each([
    [
      "missing auth dependency",
      { auth: undefined },
      503,
      "AUTH_NOT_CONFIGURED",
    ],
    ["missing credential", { auth: missingAuth }, 401, "AUTH_REQUIRED"],
    ["invalid credential", { auth: invalidAuth }, 401, "AUTH_INVALID"],
    [
      "missing profiles",
      { profiles: undefined },
      503,
      "PROFILE_NOT_CONFIGURED",
    ],
    [
      "missing authority",
      { authority: undefined },
      503,
      "AUTHORITY_NOT_CONFIGURED",
    ],
    [
      "missing platform writer",
      { platformSocial: undefined },
      503,
      "PLATFORM_SOCIAL_NOT_CONFIGURED",
    ],
  ] as const)(
    "rejects %s before any platform write",
    async (_name, override, status, code) => {
      let writes = 0;
      const response = await createApp(
        dependencies({
          ...override,
          platformSocial:
            "platformSocial" in override
              ? override.platformSocial
              : platform({
                  createIp: async () => {
                    writes += 1;
                    return ip;
                  },
                }),
        }),
      ).request("/v1/admin/ips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requests[0][1]),
      });
      await expectError(response, status, code);
      expect(writes).toBe(0);
    },
  );

  it("ensures and loads the human profile before checking explicit operator authority", async () => {
    const calls: unknown[] = [];
    const response = await createApp(
      dependencies({
        profiles: profiles({
          ensureHumanProfile: async (input) => {
            calls.push(["ensure", input]);
          },
          getCurrentAccount: async (actor) => {
            calls.push(["get", actor]);
            return account;
          },
        }),
        authority: {
          isCurrentActorOperator: async (actor) => {
            calls.push(["authority", actor]);
            return true;
          },
        },
        platformSocial: platform({
          createIp: async (input) => {
            calls.push(["write", input]);
            return ip;
          },
        }),
      }),
    ).request("/v1/admin/ips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[0][1]),
    });

    expect(response.status).toBe(201);
    expect(calls.map((entry) => (entry as unknown[])[0])).toEqual([
      "ensure",
      "get",
      "authority",
      "write",
    ]);
    expect(calls[0]).toEqual([
      "ensure",
      {
        authSubject: subject,
        email: identity.email,
        displayName: identity.displayName,
      },
    ]);
  });

  it("rejects a nonoperator with OPERATOR_REQUIRED and never invokes the platform port", async () => {
    let writes = 0;
    const response = await createApp(
      dependencies({
        authority: authority(false),
        platformSocial: platform({
          createIp: async () => {
            writes += 1;
            return ip;
          },
        }),
      }),
    ).request("/v1/admin/ips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[0][1]),
    });

    await expectError(response, 403, "OPERATOR_REQUIRED");
    expect(writes).toBe(0);
  });

  it("returns 401 for a missing credential before inspecting downstream dependencies", async () => {
    await expectError(
      await createApp({ auth: missingAuth }).request("/v1/admin/ips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requests[0][1]),
      }),
      401,
      "AUTH_REQUIRED",
    );
  });

  it("rejects a non-human account without using owner or admin fallback", async () => {
    const response = await createApp(
      dependencies({
        profiles: profiles({
          getCurrentAccount: async () => ({
            kind: "ip",
            id: ipProfileId,
            username: "luna_ip",
            displayName: "Luna",
            languages: ["en"],
          }),
        }),
      }),
    ).request("/v1/admin/ips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[0][1]),
    });
    await expectError(response, 403, "HUMAN_REQUIRED");
  });
});

describe("operator social writes", () => {
  it("creates an IP with only normalized contract input and request correlation", async () => {
    const calls: unknown[] = [];
    const response = await createApp(
      dependencies({
        platformSocial: platform({
          createIp: async (input) => {
            calls.push(input);
            return ip;
          },
        }),
      }),
    ).request("/v1/admin/ips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[0][1]),
    });
    expect(response.status).toBe(201);
    expect(CreateIpResponseSchema.parse(await response.json())).toEqual(ip);
    expect(calls).toEqual([
      {
        actor: { subject },
        requestId: response.headers.get("x-request-id"),
        ip: {
          username: "luna_ip",
          displayName: "Luna",
          bio: "Public",
          languageCodes: ["en"],
        },
      },
    ]);
  });

  it("publishes a post with only normalized contract input and request correlation", async () => {
    const calls: unknown[] = [];
    const response = await createApp(
      dependencies({
        platformSocial: platform({
          publishPost: async (input) => {
            calls.push(input);
            return post;
          },
        }),
      }),
    ).request("/v1/admin/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[1][1]),
    });
    expect(response.status).toBe(201);
    expect(CreatePostResponseSchema.parse(await response.json())).toEqual(post);
    expect(calls).toEqual([
      {
        actor: { subject },
        requestId: response.headers.get("x-request-id"),
        post: { ipProfileId, body: "Hello", languageCode: "en" },
      },
    ]);
  });

  it("creates a bound public upload intent, HEAD-verifies it, and registers dimensions", async () => {
    const reservationId = randomUUID(),
      calls: unknown[] = [];
    const writer = platform({
      reservePostMedia: async (input) => {
        calls.push(["reserve", input]);
        return {
          id: reservationId,
          objectKey: `public/posts/${reservationId}.png`,
          contentType: "image/png",
          sizeBytes: 4096,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        };
      },
      getPostMediaReservation: async () => ({
        id: reservationId,
        objectKey: `public/posts/${reservationId}.png`,
        contentType: "image/png",
        sizeBytes: 4096,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        verifiedAt: null,
        width: null,
        height: null,
      }),
      verifyPostMedia: async (input) => {
        calls.push(["verify", input]);
        return true;
      },
    });
    const assets = {
      createUploadIntent: async () => ({
        method: "PUT" as const,
        url: "https://signed.example/upload",
        headers: { "content-type": "image/png" as const },
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        maxBytes: 10_485_760 as const,
      }),
      inspectUpload: async (input: unknown) => {
        calls.push(["head", input]);
        return { contentType: "image/png" as const, sizeBytes: 4096 };
      },
    };
    const app = createApp(
      dependencies({ platformSocial: writer, postMediaAssets: assets }),
    );
    const intent = await app.request("/v1/admin/post-media/upload-intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType: "image/png", sizeBytes: 4096 }),
    });
    expect(intent.status).toBe(201);
    expect(await intent.json()).toMatchObject({
      reservationId,
      method: "PUT",
      maxBytes: 10_485_760,
    });
    const registered = await app.request(
      `/v1/admin/post-media/${reservationId}/register`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ width: 1200, height: 800 }),
      },
    );
    expect(registered.status).toBe(201);
    expect(await registered.json()).toEqual({
      reservationId,
      contentType: "image/png",
      sizeBytes: 4096,
      width: 1200,
      height: 800,
    });
    expect(calls.map((call) => (call as unknown[])[0])).toEqual([
      "reserve",
      "head",
      "verify",
    ]);
  });

  it("returns 503 for media upload and media publish when public R2 is absent while text publishing remains available", async () => {
    const app = createApp(dependencies());
    await expectError(
      await app.request("/v1/admin/post-media/upload-intents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentType: "image/png", sizeBytes: 100 }),
      }),
      503,
      "POST_MEDIA_NOT_CONFIGURED",
    );
    await expectError(
      await app.request("/v1/admin/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ipProfileId,
          body: "",
          media: [{ reservationId: randomUUID() }],
        }),
      }),
      503,
      "POST_MEDIA_NOT_CONFIGURED",
    );
    expect(
      (
        await app.request("/v1/admin/posts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ipProfileId, body: "text" }),
        })
      ).status,
    ).toBe(201);
  });

  it("authenticates before reading a post body and rejects declared oversized media JSON", async () => {
    const unauthorized = createApp(dependencies({ auth: missingAuth }));
    await expectError(
      await unauthorized.request("/v1/admin/posts", {
        method: "POST",
        headers: { "content-length": "70000" },
        body: "{}",
      }),
      401,
      "AUTH_REQUIRED",
    );
    const response = await createApp(
      dependencies({
        postMediaAssets: {
          createUploadIntent: async () => {
            throw new Error("must not run");
          },
          inspectUpload: async () => {
            throw new Error("must not run");
          },
        },
      }),
    ).request("/v1/admin/post-media/upload-intents", {
      method: "POST",
      headers: { "content-length": "70000" },
      body: "{}",
    });
    await expectError(response, 413, "PAYLOAD_TOO_LARGE");
  });

  it("publishes an IP comment with path, normalized input, actor, and request correlation", async () => {
    const calls: unknown[] = [];
    const response = await createApp(
      dependencies({
        platformSocial: platform({
          publishIpComment: async (input) => {
            calls.push(input);
            return comment;
          },
        }),
      }),
    ).request(`/v1/admin/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[2][1]),
    });
    expect(response.status).toBe(201);
    expect(CreateIpCommentResponseSchema.parse(await response.json())).toEqual(
      comment,
    );
    expect(calls).toEqual([
      {
        actor: { subject },
        requestId: response.headers.get("x-request-id"),
        postId,
        comment: { ipProfileId, body: "Reply", parentCommentId },
      },
    ]);
  });

  it.each(requests)(
    "rejects unknown and duplicate query keys on %s",
    async (path, body) => {
      await expectError(
        await createApp(dependencies()).request(`${path}?source=admin`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        400,
        "INVALID_REQUEST",
      );
      await expectError(
        await createApp(dependencies()).request(`${path}?x=1&x=2`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        400,
        "INVALID_REQUEST",
      );
    },
  );

  it.each([
    ["/v1/admin/ips", { ...requests[0][1], operatorProfileId: randomUUID() }],
    ["/v1/admin/ips", { ...requests[0][1], source: "admin" }],
    ["/v1/admin/posts", { ...requests[1][1], state: "published" }],
    ["/v1/admin/posts", { ...requests[1][1], publishedAt: createdAt }],
    [
      `/v1/admin/posts/${postId}/comments`,
      { ...requests[2][1], mediaUrls: ["https://attacker.invalid/x"] },
    ],
    [
      `/v1/admin/posts/${postId}/comments`,
      { ...requests[2][1], objectKeys: ["secret"] },
    ],
  ] as const)(
    "rejects forged or server-owned body fields on %s",
    async (path, body) => {
      await expectError(
        await createApp(dependencies()).request(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        422,
        "INVALID_REQUEST",
      );
    },
  );

  it.each([
    ["/v1/admin/ips", "null"],
    ["/v1/admin/posts", "{"],
    [
      `/v1/admin/posts/${postId}/comments`,
      JSON.stringify({ ipProfileId, body: "   " }),
    ],
  ])("rejects malformed contract input on %s", async (path, body) => {
    await expectError(
      await createApp(dependencies()).request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      422,
      "INVALID_REQUEST",
    );
  });

  it("rejects duplicate body keys, including equivalent escaped keys", async () => {
    let writes = 0;
    const app = createApp(
      dependencies({
        platformSocial: platform({
          createIp: async () => {
            writes += 1;
            return ip;
          },
        }),
      }),
    );
    await expectError(
      await app.request("/v1/admin/ips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"username":"luna_ip","username":"forged_ip","displayName":"Luna"}',
      }),
      422,
      "INVALID_REQUEST",
    );
    await expectError(
      await app.request("/v1/admin/ips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"username":"luna_ip","user\\u006eame":"forged_ip","displayName":"Luna"}',
      }),
      422,
      "INVALID_REQUEST",
    );
    expect(writes).toBe(0);
  });

  it("rejects an invalid post path before authority or platform calls", async () => {
    const authorityCalls: unknown[] = [];
    let writes = 0;
    const response = await createApp(
      dependencies({
        authority: authority(true, authorityCalls),
        platformSocial: platform({
          publishIpComment: async () => {
            writes += 1;
            return comment;
          },
        }),
      }),
    ).request("/v1/admin/posts/not-a-uuid/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[2][1]),
    });
    await expectError(response, 400, "INVALID_REQUEST");
    expect(authorityCalls).toEqual([]);
    expect(writes).toBe(0);
  });

  it("filters platform results through strict public response contracts", async () => {
    const unsafe = {
      ...ip,
      operatorProfileId: randomUUID(),
      source: "admin",
    } as unknown as typeof ip;
    const response = await createApp(
      dependencies({
        platformSocial: platform({ createIp: async () => unsafe }),
      }),
    ).request("/v1/admin/ips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[0][1]),
    });
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toContain("operatorProfileId");
    expect(text).not.toContain("admin");
  });
});

describe("operator error mapping", () => {
  it.each([
    ["IP_NOT_PUBLISHABLE", new Error("IP_NOT_PUBLISHABLE")],
    [
      "IP_NOT_PUBLISHABLE",
      { code: "P0001", message: "private invalid-state detail" },
    ],
  ])("maps invalid IP state to a safe 409 %s", async (expectedCode, thrown) => {
    const response = await createApp(
      dependencies({
        platformSocial: platform({
          publishPost: async () => {
            throw thrown;
          },
        }),
      }),
    ).request("/v1/admin/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[1][1]),
    });
    const text = await response.clone().text();
    await expectError(response, 409, expectedCode);
    expect(text).not.toContain("private");
  });

  it("maps a missing target post to 404 without leaking PostgreSQL detail", async () => {
    const response = await createApp(
      dependencies({
        platformSocial: platform({
          publishIpComment: async () => {
            throw { code: "P0002", message: "private SQL detail" };
          },
        }),
      }),
    ).request(`/v1/admin/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[2][1]),
    });
    const text = await response.clone().text();
    await expectError(response, 404, "POST_NOT_FOUND");
    expect(text).not.toContain("private SQL detail");
  });

  it("maps a missing represented IP target to 404 without leaking foreign-key detail", async () => {
    const response = await createApp(
      dependencies({
        platformSocial: platform({
          publishPost: async () => {
            throw { code: "23503", message: "private foreign-key detail" };
          },
        }),
      }),
    ).request("/v1/admin/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[1][1]),
    });
    const text = await response.clone().text();
    await expectError(response, 404, "IP_NOT_FOUND");
    expect(text).not.toContain("private foreign-key detail");
  });

  it("maps an invalid comment thread to 422 without leaking constraint detail", async () => {
    const response = await createApp(
      dependencies({
        platformSocial: platform({
          publishIpComment: async () => {
            throw { code: "23514", message: "private constraint detail" };
          },
        }),
      }),
    ).request(`/v1/admin/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[2][1]),
    });
    const text = await response.clone().text();
    await expectError(response, 422, "COMMENT_INVALID");
    expect(text).not.toContain("private constraint detail");
  });

  it.each([
    ["/v1/admin/ips", "createIp"],
    ["/v1/admin/posts", "publishPost"],
  ] as const)(
    "maps PostgreSQL request constraints on %s to safe 422 errors",
    async (path, operation) => {
      const writer = platform({
        [operation]: async () => {
          throw { code: "23514", message: "private constraint detail" };
        },
      });
      const body = path.endsWith("/ips") ? requests[0][1] : requests[1][1];
      const response = await createApp(
        dependencies({ platformSocial: writer }),
      ).request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await response.clone().text();
      await expectError(response, 422, "INVALID_REQUEST");
      expect(text).not.toContain("private constraint detail");
    },
  );

  it.each([
    ["/v1/admin/ips", "createIp"],
    ["/v1/admin/posts", "publishPost"],
    [`/v1/admin/posts/${postId}/comments`, "publishIpComment"],
  ] as const)(
    "maps PostgreSQL uniqueness errors on %s to safe 422 errors",
    async (path, operation) => {
      const writer = platform({
        [operation]: async () => {
          throw { code: "23505", message: "private unique index detail" };
        },
      });
      const body =
        operation === "createIp"
          ? requests[0][1]
          : operation === "publishPost"
            ? requests[1][1]
            : requests[2][1];
      const response = await createApp(
        dependencies({ platformSocial: writer }),
      ).request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await response.clone().text();
      await expectError(response, 422, "INVALID_REQUEST");
      expect(text).not.toContain("private unique index detail");
    },
  );

  it("maps a database authorization race to OPERATOR_REQUIRED", async () => {
    const response = await createApp(
      dependencies({
        platformSocial: platform({
          createIp: async () => {
            throw { code: "42501", message: "policy detail" };
          },
        }),
      }),
    ).request("/v1/admin/ips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[0][1]),
    });
    await expectError(response, 403, "OPERATOR_REQUIRED");
  });

  it("redacts unexpected collaborator errors", async () => {
    const response = await createApp(
      dependencies({
        platformSocial: platform({
          createIp: async () => {
            throw new Error("database password leaked");
          },
        }),
      }),
    ).request("/v1/admin/ips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests[0][1]),
    });
    const text = await response.clone().text();
    await expectError(response, 500, "INTERNAL_ERROR");
    expect(text).not.toContain("database password leaked");
  });

  it.each([
    ["DATABASE_USER_URL must be a valid postgres URL", "createIp"],
    ["DATABASE_PLATFORM_URL must be a valid postgres URL", "createIp"],
  ] as const)(
    "maps missing lazy environment dependency to a safe 503",
    async (message, operation) => {
      const response = await createApp(
        dependencies({
          ...(message.includes("USER")
            ? {
                authority: {
                  isCurrentActorOperator: async () => {
                    throw new Error(message);
                  },
                },
              }
            : {
                platformSocial: platform({
                  [operation]: async () => {
                    throw new Error(message);
                  },
                }),
              }),
        }),
      ).request("/v1/admin/ips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requests[0][1]),
      });
      await expectError(response, 503, "DATABASE_NOT_CONFIGURED");
    },
  );

  it("validates the real authority adapter user environment lazily and returns a safe 503", async () => {
    const previousUserUrl = process.env.DATABASE_USER_URL;
    delete process.env.DATABASE_USER_URL;
    try {
      const response = await createApp(
        dependencies({ authority: databaseAuthorityPort }),
      ).request("/v1/admin/ips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requests[0][1]),
      });
      await expectError(response, 503, "DATABASE_NOT_CONFIGURED");
    } finally {
      if (previousUserUrl === undefined) delete process.env.DATABASE_USER_URL;
      else process.env.DATABASE_USER_URL = previousUserUrl;
    }
  });
});
