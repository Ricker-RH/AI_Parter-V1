import {
  CreateIpCommentResponseSchema,
  CreateIpCommentSchema,
  CreateIpResponseSchema,
  CreateIpSchema,
  CreatePostResponseSchema,
  CreatePostSchema,
  PostMediaUploadIntentRequestSchema,
  PostMediaUploadIntentResponseSchema,
  RegisterPostMediaSchema,
  RegisteredPostMediaSchema,
} from "@aifans/contracts";
import { randomUUID } from "node:crypto";
import type { Actor } from "@aifans/db";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { apiError } from "../errors.js";
import type { ApiVariables } from "../middleware/request-id.js";
import type { AuthVerifier } from "../ports/auth.js";
import type { AuthorityPort } from "../ports/authority.js";
import type { PlatformSocialPort } from "../ports/platform-social.js";
import type { ProfilePort } from "../ports/profiles.js";
import type { PostMediaAssetPort } from "../ports/post-media-assets.js";

export type AdminDependencies = {
  auth?: AuthVerifier;
  profiles?: ProfilePort;
  authority?: AuthorityPort;
  platformSocial?: PlatformSocialPort;
  postMediaAssets?: PostMediaAssetPort;
};

type ApiContext = Context<{ Variables: ApiVariables }>;
type OperatorResolution =
  { ok: true; actor: Actor } | { ok: false; response: Response };
type PlatformOperation = "ip" | "post" | "comment";

const EmptyQuerySchema = z.strictObject({});
const IdSchema = z.uuid();

function safeQuery(c: ApiContext): Record<string, string> | null {
  const values: Array<[string, string]> = [];
  const keys = new Set<string>();
  for (const entry of new URL(c.req.url).searchParams.entries()) {
    if (keys.has(entry[0])) return null;
    keys.add(entry[0]);
    values.push(entry);
  }
  return Object.fromEntries(values);
}

function stringEnd(text: string, start: number): number {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === '"') return index + 1;
  }
  return -1;
}

function valueEnd(text: string, start: number): number {
  let quoted = false;
  let escaped = false;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{" || character === "[") depth += 1;
    else if (character === "}" || character === "]") {
      if (depth === 0) return index;
      depth -= 1;
    } else if (character === "," && depth === 0) return index;
  }
  return text.length;
}

function hasDuplicateRootKeys(text: string): boolean {
  let index = 1;
  const keys = new Set<string>();
  while (index < text.length) {
    while (/\s/.test(text[index] ?? "")) index += 1;
    if (text[index] === "}") return false;
    if (text[index] !== '"') return false;
    const end = stringEnd(text, index);
    if (end < 0) return false;
    const key = JSON.parse(text.slice(index, end)) as string;
    if (keys.has(key)) return true;
    keys.add(key);
    index = end;
    while (/\s/.test(text[index] ?? "")) index += 1;
    if (text[index] !== ":") return false;
    index = valueEnd(text, index + 1);
    if (text[index] === ",") index += 1;
  }
  return false;
}

const BODY_TOO_LARGE = Symbol("BODY_TOO_LARGE");

async function strictBody<T>(
  c: ApiContext,
  schema: z.ZodType<T>,
): Promise<T | null | typeof BODY_TOO_LARGE> {
  const declared = c.req.header("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 65_536))
    return BODY_TOO_LARGE;
  const reader = c.req.raw.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) {
        await reader.cancel();
        return BODY_TOO_LARGE;
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  try {
    const parsedJson: unknown = JSON.parse(text);
    if (
      typeof parsedJson !== "object" ||
      parsedJson === null ||
      Array.isArray(parsedJson) ||
      hasDuplicateRootKeys(text.trim())
    )
      return null;
    const result = schema.safeParse(parsedJson);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function errorProperty(
  error: unknown,
  property: "code" | "message",
): string | undefined {
  if (typeof error !== "object" || error === null || !(property in error))
    return undefined;
  const value = error[property as keyof typeof error];
  return typeof value === "string" ? value : undefined;
}

function dependencyError(c: ApiContext, error: unknown): Response | null {
  const message = errorProperty(error, "message");
  if (
    message &&
    /^DATABASE_(?:USER|ADMIN|PLATFORM)_URL must be a valid postgres URL$/.test(
      message,
    )
  ) {
    return apiError(
      c,
      503,
      "DATABASE_NOT_CONFIGURED",
      "Database is not configured",
    );
  }
  return null;
}

async function requireOperator(
  c: ApiContext,
  dependencies: AdminDependencies,
): Promise<OperatorResolution> {
  const { auth, profiles, authority } = dependencies;
  if (!auth)
    return {
      ok: false,
      response: apiError(
        c,
        503,
        "AUTH_NOT_CONFIGURED",
        "Authentication is not configured",
      ),
    };

  const result = await auth.verify(c.req.raw);
  if (result.status === "missing")
    return {
      ok: false,
      response: apiError(c, 401, "AUTH_REQUIRED", "Authentication is required"),
    };
  if (result.status === "invalid" || !result.identity.subject.trim()) {
    return {
      ok: false,
      response: apiError(c, 401, "AUTH_INVALID", "Authentication is invalid"),
    };
  }
  if (!profiles)
    return {
      ok: false,
      response: apiError(
        c,
        503,
        "PROFILE_NOT_CONFIGURED",
        "Profiles are not configured",
      ),
    };

  const actor = { subject: result.identity.subject };
  await profiles.ensureHumanProfile({
    authSubject: result.identity.subject,
    ...(result.identity.email === undefined
      ? {}
      : { email: result.identity.email }),
    ...(result.identity.displayName === undefined
      ? {}
      : { displayName: result.identity.displayName }),
  });
  const account = await profiles.getCurrentAccount(actor);
  if (account === null)
    return {
      ok: false,
      response: apiError(
        c,
        500,
        "PROFILE_NOT_AVAILABLE",
        "Profile is not available",
      ),
    };
  if (account.kind !== "human")
    return {
      ok: false,
      response: apiError(
        c,
        403,
        "HUMAN_REQUIRED",
        "A human account is required",
      ),
    };
  if (!authority)
    return {
      ok: false,
      response: apiError(
        c,
        503,
        "AUTHORITY_NOT_CONFIGURED",
        "Authority is not configured",
      ),
    };
  if (!(await authority.isCurrentActorOperator(actor))) {
    return {
      ok: false,
      response: apiError(
        c,
        403,
        "OPERATOR_REQUIRED",
        "An active operator is required",
      ),
    };
  }
  return { ok: true, actor };
}

function platformError(
  c: ApiContext,
  error: unknown,
  operation: PlatformOperation,
): Response {
  const unavailable = dependencyError(c, error);
  if (unavailable) return unavailable;
  const code = errorProperty(error, "code");
  const message = errorProperty(error, "message");
  if (code === "42501" || message === "FORBIDDEN") {
    return apiError(
      c,
      403,
      "OPERATOR_REQUIRED",
      "An active operator is required",
    );
  }
  if (code === "P0001" || message === "IP_NOT_PUBLISHABLE") {
    return apiError(c, 409, "IP_NOT_PUBLISHABLE", "IP is not publishable");
  }
  if (operation === "comment" && code === "P0002") {
    return apiError(c, 404, "POST_NOT_FOUND", "Post not found");
  }
  if (operation === "post" && code === "23503") {
    return apiError(c, 404, "IP_NOT_FOUND", "IP not found");
  }
  if (
    operation === "comment" &&
    (code === "23514" || message === "COMMENT_INVALID")
  ) {
    return apiError(c, 422, "COMMENT_INVALID", "Comment thread is invalid");
  }
  if (code === "23514" || code === "23505") {
    return apiError(c, 422, "INVALID_REQUEST", "Request is invalid");
  }
  if (message === "POST_MEDIA_INVALID" || message === "POST_MEDIA_NOT_FOUND")
    return apiError(c, 422, "POST_MEDIA_INVALID", "Post media is invalid");
  throw error;
}

function invalidQuery(c: ApiContext): Response | null {
  const query = safeQuery(c);
  return query !== null && EmptyQuerySchema.safeParse(query).success
    ? null
    : apiError(c, 400, "INVALID_REQUEST", "Request is invalid");
}

export function registerAdminRoutes(
  app: Hono<{ Variables: ApiVariables }>,
  dependencies: AdminDependencies,
) {
  app.get("/v1/admin/access", async (c) => {
    const queryError = invalidQuery(c);
    if (queryError) return queryError;
    const operator = await requireOperator(c, dependencies);
    if (!operator.ok) return operator.response;
    return c.body(null, 204);
  });

  app.post("/v1/admin/post-media/upload-intents", async (c) => {
    const queryError = invalidQuery(c);
    if (queryError) return queryError;
    const operator = await requireOperator(c, dependencies);
    if (!operator.ok) return operator.response;
    if (!dependencies.platformSocial)
      return apiError(
        c,
        503,
        "PLATFORM_SOCIAL_NOT_CONFIGURED",
        "Platform social features are not configured",
      );
    if (!dependencies.postMediaAssets)
      return apiError(
        c,
        503,
        "POST_MEDIA_NOT_CONFIGURED",
        "Post media is not configured",
      );
    const body = await strictBody(c, PostMediaUploadIntentRequestSchema);
    if (body === BODY_TOO_LARGE)
      return apiError(c, 413, "PAYLOAD_TOO_LARGE", "Payload is too large");
    if (!body) return apiError(c, 422, "INVALID_REQUEST", "Request is invalid");
    try {
      const reservation = await dependencies.platformSocial.reservePostMedia({
        actor: operator.actor,
        requestId: c.get("requestId"),
        reservationId: randomUUID(),
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      });
      const intent =
        await dependencies.postMediaAssets.createUploadIntent(reservation);
      return c.json(
        PostMediaUploadIntentResponseSchema.parse({
          reservationId: reservation.id,
          ...intent,
        }),
        201,
      );
    } catch (error) {
      return platformError(c, error, "post");
    }
  });
  app.post("/v1/admin/post-media/:reservationId/register", async (c) => {
    const queryError = invalidQuery(c);
    if (queryError) return queryError;
    const id = IdSchema.safeParse(c.req.param("reservationId"));
    if (!id.success)
      return apiError(c, 400, "INVALID_REQUEST", "Request is invalid");
    const operator = await requireOperator(c, dependencies);
    if (!operator.ok) return operator.response;
    if (!dependencies.platformSocial)
      return apiError(
        c,
        503,
        "PLATFORM_SOCIAL_NOT_CONFIGURED",
        "Platform social features are not configured",
      );
    if (!dependencies.postMediaAssets)
      return apiError(
        c,
        503,
        "POST_MEDIA_NOT_CONFIGURED",
        "Post media is not configured",
      );
    const body = await strictBody(c, RegisterPostMediaSchema);
    if (body === BODY_TOO_LARGE)
      return apiError(c, 413, "PAYLOAD_TOO_LARGE", "Payload is too large");
    if (!body) return apiError(c, 422, "INVALID_REQUEST", "Request is invalid");
    try {
      const reservation =
        await dependencies.platformSocial.getPostMediaReservation(
          operator.actor,
          id.data,
        );
      if (!reservation)
        return apiError(
          c,
          404,
          "POST_MEDIA_NOT_FOUND",
          "Post media was not found",
        );
      await dependencies.postMediaAssets.inspectUpload({
        objectKey: reservation.objectKey,
        contentType: reservation.contentType,
        sizeBytes: reservation.sizeBytes,
      });
      await dependencies.platformSocial.verifyPostMedia({
        actor: operator.actor,
        reservationId: id.data,
        contentType: reservation.contentType,
        sizeBytes: reservation.sizeBytes,
        width: body.width,
        height: body.height,
      });
      return c.json(
        RegisteredPostMediaSchema.parse({
          reservationId: id.data,
          contentType: reservation.contentType,
          sizeBytes: reservation.sizeBytes,
          ...body,
        }),
        201,
      );
    } catch (error) {
      return platformError(c, error, "post");
    }
  });
  app.post("/v1/admin/ips", async (c) => {
    const queryError = invalidQuery(c);
    if (queryError) return queryError;
    const body = await strictBody(c, CreateIpSchema);
    if (body === BODY_TOO_LARGE)
      return apiError(c, 413, "PAYLOAD_TOO_LARGE", "Payload is too large");
    if (!body) return apiError(c, 422, "INVALID_REQUEST", "Request is invalid");
    try {
      const operator = await requireOperator(c, dependencies);
      if (!operator.ok) return operator.response;
      if (!dependencies.platformSocial)
        return apiError(
          c,
          503,
          "PLATFORM_SOCIAL_NOT_CONFIGURED",
          "Platform social features are not configured",
        );
      const result = await dependencies.platformSocial.createIp({
        actor: operator.actor,
        requestId: c.get("requestId"),
        ip: body,
      });
      return c.json(CreateIpResponseSchema.parse(result), 201);
    } catch (error) {
      return platformError(c, error, "ip");
    }
  });

  app.post("/v1/admin/posts", async (c) => {
    const queryError = invalidQuery(c);
    if (queryError) return queryError;
    const operator = await requireOperator(c, dependencies);
    if (!operator.ok) return operator.response;
    const body = await strictBody(c, CreatePostSchema);
    if (body === BODY_TOO_LARGE)
      return apiError(c, 413, "PAYLOAD_TOO_LARGE", "Payload is too large");
    if (!body) return apiError(c, 422, "INVALID_REQUEST", "Request is invalid");
    try {
      if (body.media?.length && !dependencies.postMediaAssets)
        return apiError(
          c,
          503,
          "POST_MEDIA_NOT_CONFIGURED",
          "Post media is not configured",
        );
      if (!dependencies.platformSocial)
        return apiError(
          c,
          503,
          "PLATFORM_SOCIAL_NOT_CONFIGURED",
          "Platform social features are not configured",
        );
      const result = await dependencies.platformSocial.publishPost({
        actor: operator.actor,
        requestId: c.get("requestId"),
        post: body,
      });
      return c.json(CreatePostResponseSchema.parse(result), 201);
    } catch (error) {
      return platformError(c, error, "post");
    }
  });

  app.post("/v1/admin/posts/:postId/comments", async (c) => {
    const queryError = invalidQuery(c);
    if (queryError) return queryError;
    const parsedPostId = IdSchema.safeParse(c.req.param("postId"));
    if (!parsedPostId.success)
      return apiError(c, 400, "INVALID_REQUEST", "Request is invalid");
    const body = await strictBody(c, CreateIpCommentSchema);
    if (body === BODY_TOO_LARGE)
      return apiError(c, 413, "PAYLOAD_TOO_LARGE", "Payload is too large");
    if (!body) return apiError(c, 422, "INVALID_REQUEST", "Request is invalid");
    try {
      const operator = await requireOperator(c, dependencies);
      if (!operator.ok) return operator.response;
      if (!dependencies.platformSocial)
        return apiError(
          c,
          503,
          "PLATFORM_SOCIAL_NOT_CONFIGURED",
          "Platform social features are not configured",
        );
      const result = await dependencies.platformSocial.publishIpComment({
        actor: operator.actor,
        requestId: c.get("requestId"),
        postId: parsedPostId.data,
        comment: body,
      });
      return c.json(CreateIpCommentResponseSchema.parse(result), 201);
    } catch (error) {
      return platformError(c, error, "comment");
    }
  });
}
