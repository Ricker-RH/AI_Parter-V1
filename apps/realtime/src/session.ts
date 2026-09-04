import { z } from "zod";
import { HumanRealtimeEventSchema } from "@aifans/contracts";

export interface SocketPort {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
  send(value: string): void;
  close(code: number, reason?: string): void;
}
export const IdentitySchema = z.strictObject({
  subject: z.string().min(1).max(512),
  profileId: z.uuid(),
  sessionId: z.uuid(),
  sessionExpiresAt: z.number().int().positive(),
});
export type Identity = z.infer<typeof IdentitySchema>;
export interface Upstream {
  now(): number;
  redeem(ticket: string, origin: string): Promise<Identity>;
  authorize(
    identity: Identity,
    conversationId: string,
    eventType?: string,
  ): Promise<{ allowed: boolean; presenceAllowed: boolean }>;
}
const StateSchema = z.strictObject({
  v: z.literal(1),
  mailbox: z.uuid(),
  origin: z.string().max(256),
  opened: z.number(),
  lastSeen: z.number(),
  window: z.number(),
  count: z.number(),
  closed: z.boolean(),
  identity: IdentitySchema.nullable(),
  subscriptions: z.array(z.uuid()).max(32),
});
const FrameSchema = z.discriminatedUnion("type", [
  z.strictObject({
    v: z.literal(1),
    type: z.literal("auth"),
    ticket: z.string().min(1).max(4096),
  }),
  z.strictObject({
    v: z.literal(1),
    type: z.enum(["subscribe", "unsubscribe"]),
    conversationId: z.uuid(),
  }),
]);
type State = z.infer<typeof StateSchema>;
const read = (ws: SocketPort) => StateSchema.parse(ws.deserializeAttachment());
const write = (ws: SocketPort, state: State) => ws.serializeAttachment(state);
function close(ws: SocketPort, state: State, code: number) {
  state.closed = true;
  write(ws, state);
  ws.close(code, "realtime session closed");
}
export function initialize(
  ws: SocketPort,
  mailbox: string,
  origin: string,
  now: number,
) {
  write(ws, {
    v: 1,
    mailbox,
    origin,
    opened: now,
    lastSeen: now,
    window: now,
    count: 0,
    closed: false,
    identity: null,
    subscriptions: [],
  });
}
export function deadline(ws: SocketPort): number | null {
  const parsed = StateSchema.safeParse(ws.deserializeAttachment());
  if (!parsed.success) return null;
  const s = parsed.data;
  return s.closed
    ? null
    : s.identity
      ? s.identity.sessionExpiresAt
      : s.opened + 10000;
}
export function expire(ws: SocketPort, now: number): boolean {
  const parsed = StateSchema.safeParse(ws.deserializeAttachment());
  if (!parsed.success) {
    ws.close(4401, "realtime session closed");
    return true;
  }
  const s = parsed.data;
  if (s.closed) return true;
  const end = deadline(ws)!;
  if (now >= end) {
    close(ws, s, 4408);
    return true;
  }
  return false;
}
export function socketCounts(sockets: SocketPort[], now: number) {
  const counts = { pending: 0, authenticated: 0 };
  for (const ws of sockets) {
    if (expire(ws, now)) continue;
    if (read(ws).identity) counts.authenticated++;
    else counts.pending++;
  }
  return counts;
}
export async function receive(
  ws: SocketPort,
  raw: string | ArrayBuffer,
  ports: Upstream,
  canAuthenticate: () => boolean = () => true,
) {
  if (expire(ws, ports.now())) return;
  let s = read(ws);
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).byteLength > 8192
  ) {
    close(ws, s, 4400);
    return;
  }
  if (ports.now() - s.window >= 10000) {
    s.window = ports.now();
    s.count = 0;
  }
  if (++s.count > 30) {
    close(ws, s, 4429);
    return;
  }
  s.lastSeen = ports.now();
  write(ws, s);
  let frame: z.infer<typeof FrameSchema>;
  try {
    frame = FrameSchema.parse(JSON.parse(raw));
  } catch {
    close(ws, s, 4400);
    return;
  }
  try {
    if (frame.type === "auth") {
      const identity = IdentitySchema.parse(
        await ports.redeem(frame.ticket, s.origin),
      );
      // Async upstream work can overlap other events; never revive closed sockets.
      if (expire(ws, ports.now())) return;
      s = read(ws);
      if (
        identity.profileId !== s.mailbox ||
        identity.sessionExpiresAt <= ports.now() ||
        identity.sessionExpiresAt > ports.now() + 300000 ||
        (s.identity && s.identity.subject !== identity.subject)
      )
        throw new Error("invalid identity");
      if (!s.identity && !canAuthenticate()) {
        close(ws, s, 4429);
        return;
      }
      s.identity = identity;
      write(ws, s);
      ws.send(JSON.stringify({ v: 1, type: "auth_ok" }));
      return;
    }
    if (!s.identity) {
      ws.send(JSON.stringify({ v: 1, type: "auth_error" }));
      close(ws, s, 4401);
      return;
    }
    if (frame.type === "unsubscribe") {
      s.subscriptions = s.subscriptions.filter(
        (id) => id !== frame.conversationId,
      );
      write(ws, s);
      return;
    }
    const access = await ports.authorize(s.identity, frame.conversationId);
    if (expire(ws, ports.now())) return;
    s = read(ws);
    if (!access.allowed) return;
    if (!s.subscriptions.includes(frame.conversationId)) {
      if (s.subscriptions.length >= 32) {
        close(ws, s, 4429);
        return;
      }
      s.subscriptions.push(frame.conversationId);
      write(ws, s);
    }
  } catch {
    ws.send(JSON.stringify({ v: 1, type: "auth_error" }));
    close(ws, read(ws), 4401);
  }
}
export async function deliver(ws: SocketPort, input: unknown, ports: Upstream) {
  const parsed = HumanRealtimeEventSchema.safeParse(input);
  if (!parsed.success || expire(ws, ports.now())) return;
  const event = parsed.data;
  let s = read(ws);
  if (!s.identity || !s.subscriptions.includes(event.conversationId)) return;
  // Revocation is emitted only by the trusted API and must reach former members.
  if (event.type === "access_revoked") {
    s.subscriptions = s.subscriptions.filter(
      (id) => id !== event.conversationId,
    );
    write(ws, s);
    ws.send(JSON.stringify(event));
    return;
  }
  try {
    const access = await ports.authorize(
      s.identity,
      event.conversationId,
      event.type,
    );
    if (expire(ws, ports.now())) return;
    s = read(ws);
    if (!s.subscriptions.includes(event.conversationId)) return;
    if (!access.allowed) {
      s.subscriptions = s.subscriptions.filter(
        (id) => id !== event.conversationId,
      );
      write(ws, s);
      return;
    }
    if (event.type === "presence" && !access.presenceAllowed) return;
    ws.send(JSON.stringify(event));
  } catch {
    close(ws, read(ws), 1011);
  }
}
