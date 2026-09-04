import { z } from "zod";
import { IdentitySchema, type Upstream } from "./session.js";
export interface Configuration {
  ALLOWED_ORIGINS?: string;
  UPSTREAM_API_URL?: string;
  REALTIME_INTERNAL_SECRET?: string;
}
export function configured(env: Configuration): boolean {
  try {
    const api = new URL(env.UPSTREAM_API_URL ?? "");
    const origins = (env.ALLOWED_ORIGINS ?? "").split(",");
    return (
      api.protocol === "https:" &&
      !api.username &&
      !api.password &&
      api.pathname === "/" &&
      !api.search &&
      !api.hash &&
      !!env.REALTIME_INTERNAL_SECRET &&
      env.REALTIME_INTERNAL_SECRET.length >= 32 &&
      origins.length > 0 &&
      origins.every((origin) => {
        const u = new URL(origin);
        return u.protocol === "https:" && u.origin === origin;
      })
    );
  } catch {
    return false;
  }
}
export function admit(
  request: Request,
  env: Configuration,
):
  | { status: number }
  | { profileId: string; kind: "connect"; origin: string }
  | { profileId: string; kind: "event" } {
  if (!configured(env)) return { status: 503 };
  const url = new URL(request.url);
  if (url.search) return { status: 400 };
  const connect = url.pathname.match(/^\/connect\/([^/]+)$/);
  const event = url.pathname.match(/^\/internal\/events\/([^/]+)$/);
  const id = (connect ?? event)?.[1];
  if (!id || !z.uuid().safeParse(id).success) return { status: 404 };
  if (connect) {
    const origin = request.headers.get("Origin") ?? "";
    if (!(env.ALLOWED_ORIGINS ?? "").split(",").includes(origin))
      return { status: 403 };
    if (request.method !== "GET") return { status: 405 };
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return { status: 426 };
    return { profileId: id.toLowerCase(), kind: "connect", origin };
  }
  if (request.method !== "POST") return { status: 405 };
  if (
    request.headers.get("Authorization") !==
    `Bearer ${env.REALTIME_INTERNAL_SECRET}`
  )
    return { status: 403 };
  return { profileId: id.toLowerCase(), kind: "event" };
}
export async function boundedJson(
  request: Request | Response,
  max = 16384,
): Promise<unknown> {
  if (!request.body) throw new Error("missing body");
  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) throw new Error("body too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
  );
}
export function upstream(env: Configuration): Upstream {
  async function post(path: string, body: unknown) {
    if (!configured(env)) throw new Error("unconfigured");
    const result = await fetch(
      `${new URL(env.UPSTREAM_API_URL!).origin}/v1/internal/realtime/${path}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.REALTIME_INTERNAL_SECRET}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
        // Workers supports manual/follow, not the browser's "error" mode.
        // Non-2xx (including redirects) is rejected below without forwarding secrets.
        redirect: "manual",
      },
    );
    if (!result.ok) throw new Error("upstream rejected");
    return boundedJson(result, 4096);
  }
  return {
    now: () => Date.now(),
    redeem: async (ticket, origin) =>
      IdentitySchema.parse(await post("redeem", { ticket, origin })),
    authorize: async (identity, conversationId, eventType) =>
      z
        .strictObject({ allowed: z.boolean(), presenceAllowed: z.boolean() })
        .parse(
          await post("authorize", {
            subject: identity.subject,
            profileId: identity.profileId,
            sessionId: identity.sessionId,
            conversationId,
            ...(eventType ? { eventType } : {}),
          }),
        ),
  };
}
