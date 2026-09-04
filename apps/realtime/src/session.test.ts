import { describe, expect, it } from "vitest";
import * as core from "./session.js";
const profileId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const event = {
  v: 1,
  eventId: "33333333-3333-4333-8333-333333333333",
  conversationId,
  occurredAt: "2026-09-04T00:00:00Z",
  type: "typing",
  profileId,
  isTyping: true,
} as const;
class Socket {
  data: any;
  sent: any[] = [];
  closed: number | undefined;
  serializeAttachment(data: any) {
    this.data = structuredClone(data);
  }
  deserializeAttachment() {
    return structuredClone(this.data);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code: number) {
    this.closed = code;
  }
}
function setup() {
  let allowed = true;
  let presenceAllowed = true;
  let now = 1000;
  const calls: any[] = [];
  const ports = {
    now: () => now,
    redeem: async (ticket: string, origin: string) => {
      calls.push({ ticket, origin });
      return {
        subject: "subject",
        profileId,
        sessionId: profileId,
        sessionExpiresAt: 100000,
      };
    },
    authorize: async () => ({ allowed, presenceAllowed }),
  };
  const socket = new Socket();
  return {
    socket,
    ports,
    calls,
    setAllowed: (v: boolean) => (allowed = v),
    setPresence: (v: boolean) => (presenceAllowed = v),
    setNow: (v: number) => (now = v),
  };
}
async function auth(s: ReturnType<typeof setup>) {
  core.initialize(s.socket, profileId, "https://app.example", s.ports.now());
  await core.receive(
    s.socket,
    JSON.stringify({ v: 1, type: "auth", ticket: "one-use-ticket" }),
    s.ports,
  );
}
describe("hibernation-safe gateway sessions", () => {
  it("does not let pending sockets consume authenticated device capacity", async () => {
    const pending = Array.from({ length: 10 }, () => {
      const s = setup();
      core.initialize(s.socket, profileId, "https://app.example", 1000);
      return s.socket;
    });
    expect(core.socketCounts(pending, 1000)).toEqual({
      pending: 10,
      authenticated: 0,
    });
    const s = setup();
    core.initialize(s.socket, profileId, "https://app.example", 1000);
    await core.receive(
      s.socket,
      JSON.stringify({ v: 1, type: "auth", ticket: "x" }),
      s.ports,
      () => false,
    );
    expect(s.socket.closed).toBe(4429);
    expect(s.socket.data.identity).toBeNull();
  });
  it("accepts the same 512-character subject bound as the trusted issuer", async () => {
    const s = setup();
    core.initialize(s.socket, profileId, "https://app.example", 1000);
    await core.receive(
      s.socket,
      JSON.stringify({ v: 1, type: "auth", ticket: "x" }),
      {
        ...s.ports,
        redeem: async () => ({
          subject: "s".repeat(512),
          profileId,
          sessionId: profileId,
          sessionExpiresAt: 100000,
        }),
      },
    );
    expect(s.socket.closed).toBeUndefined();
    expect(s.socket.sent).toContainEqual({ v: 1, type: "auth_ok" });
  });
  it("treats absent attachments on closing sockets as expired", () => {
    const socket = new Socket();
    expect(core.deadline(socket)).toBeNull();
    expect(core.expire(socket, 1000)).toBe(true);
  });
  it("bounds subscriptions independently of frame rate", async () => {
    const s = setup();
    await auth(s);
    for (let i = 0; i < 33; i++) {
      if (i === 20) s.setNow(11001);
      const id = `22222222-2222-4222-8222-${i.toString().padStart(12, "0")}`;
      await core.receive(
        s.socket,
        JSON.stringify({ v: 1, type: "subscribe", conversationId: id }),
        s.ports,
      );
    }
    expect(s.socket.data.subscriptions).toHaveLength(32);
    expect(s.socket.closed).toBe(4429);
  });
  it("rejects binary frames and unsupported schema version", async () => {
    const s = setup();
    await auth(s);
    await core.receive(s.socket, new ArrayBuffer(1), s.ports);
    expect(s.socket.closed).toBe(4400);
    const t = setup();
    await auth(t);
    await core.receive(
      t.socket,
      JSON.stringify({ v: 2, type: "subscribe", conversationId }),
      t.ports,
    );
    expect(t.socket.closed).toBe(4400);
  });
  it("delivers trusted revocation to former subscriber then removes subscription", async () => {
    const s = setup();
    await auth(s);
    await core.receive(
      s.socket,
      JSON.stringify({ v: 1, type: "subscribe", conversationId }),
      s.ports,
    );
    s.setAllowed(false);
    const revoked = {
      v: 1,
      eventId: event.eventId,
      conversationId,
      occurredAt: event.occurredAt,
      type: "access_revoked",
      reason: "blocked",
    };
    await core.deliver(s.socket, revoked, s.ports);
    expect(s.socket.sent).toContainEqual(revoked);
    expect(s.socket.data.subscriptions).toEqual([]);
  });
  it("fails closed if authorization service is unavailable", async () => {
    const s = setup();
    await auth(s);
    await core.receive(
      s.socket,
      JSON.stringify({ v: 1, type: "subscribe", conversationId }),
      s.ports,
    );
    s.socket.sent = [];
    await core.deliver(s.socket, event, {
      ...s.ports,
      authorize: async () => {
        throw new Error("private error");
      },
    });
    expect(s.socket.closed).toBe(1011);
    expect(s.socket.sent).toEqual([]);
  });
  it("renews with a fresh ticket while preserving subscriptions", async () => {
    const s = setup();
    await auth(s);
    await core.receive(
      s.socket,
      JSON.stringify({ v: 1, type: "subscribe", conversationId }),
      s.ports,
    );
    s.setNow(90000);
    await core.receive(
      s.socket,
      JSON.stringify({ v: 1, type: "auth", ticket: "renewal" }),
      {
        ...s.ports,
        redeem: async () => ({
          subject: "subject",
          profileId,
          sessionId: profileId,
          sessionExpiresAt: 200000,
        }),
      },
    );
    expect(core.deadline(s.socket)).toBe(200000);
    expect(s.socket.data.subscriptions).toEqual([conversationId]);
  });
  it("does not impose an idle timeout before auth expiry", async () => {
    const s = setup();
    core.initialize(s.socket, profileId, "https://app.example", 1000);
    await core.receive(
      s.socket,
      JSON.stringify({ v: 1, type: "auth", ticket: "x" }),
      {
        ...s.ports,
        redeem: async () => ({
          subject: "subject",
          profileId,
          sessionId: profileId,
          sessionExpiresAt: 300000,
        }),
      },
    );
    expect(core.expire(s.socket, 200000)).toBe(false);
  });
  it("exports session initialization", () =>
    expect(core.initialize).toBeTypeOf("function"));
  it("redeems origin-bound ticket; persists identity but never ticket", async () => {
    const s = setup();
    await auth(s);
    expect(s.calls).toEqual([
      { ticket: "one-use-ticket", origin: "https://app.example" },
    ]);
    expect(s.socket.sent).toContainEqual({ v: 1, type: "auth_ok" });
    expect(s.socket.data.identity.profileId).toBe(profileId);
    expect(JSON.stringify(s.socket.data)).not.toContain("one-use-ticket");
  });
  it("rejects subscription before auth", async () => {
    const s = setup();
    core.initialize(s.socket, profileId, "https://app.example", 1000);
    await core.receive(
      s.socket,
      JSON.stringify({ v: 1, type: "subscribe", conversationId }),
      s.ports,
    );
    expect(s.socket.closed).toBe(4401);
  });
  it("rejects impersonated mailbox", async () => {
    const s = setup();
    core.initialize(s.socket, conversationId, "https://app.example", 1000);
    await core.receive(
      s.socket,
      JSON.stringify({ v: 1, type: "auth", ticket: "x" }),
      s.ports,
    );
    expect(s.socket.closed).toBe(4401);
  });
  it("restores subscription from attachment and revalidates before fanout", async () => {
    const s = setup();
    await auth(s);
    await core.receive(
      s.socket,
      JSON.stringify({ v: 1, type: "subscribe", conversationId }),
      s.ports,
    );
    await core.deliver(s.socket, event, s.ports);
    expect(s.socket.sent).toContainEqual(event);
    s.setAllowed(false);
    s.socket.sent = [];
    await core.deliver(s.socket, event, s.ports);
    expect(s.socket.sent).toEqual([]);
    expect(s.socket.data.subscriptions).toEqual([]);
  });
  it("presence denied even when conversation allowed", async () => {
    const s = setup();
    await auth(s);
    await core.receive(
      s.socket,
      JSON.stringify({ v: 1, type: "subscribe", conversationId }),
      s.ports,
    );
    s.setPresence(false);
    const { isTyping, ...base } = event;
    await core.deliver(
      s.socket,
      { ...base, type: "presence", status: "online" },
      s.ports,
    );
    expect(s.socket.sent).toEqual([{ v: 1, type: "auth_ok" }]);
  });
  it("closes expired authenticated and unauthenticated sockets via sweep", async () => {
    const s = setup();
    await auth(s);
    s.setNow(100001);
    core.expire(s.socket, s.ports.now());
    expect(s.socket.closed).toBe(4408);
    const t = setup();
    core.initialize(t.socket, profileId, "https://app.example", 1000);
    core.expire(t.socket, 11001);
    expect(t.socket.closed).toBe(4408);
  });
  it("rejects oversized frames and spoofed sender fields", async () => {
    const s = setup();
    await auth(s);
    await core.receive(s.socket, "x".repeat(8193), s.ports);
    expect(s.socket.closed).toBe(4400);
    const t = setup();
    await auth(t);
    await core.receive(
      t.socket,
      JSON.stringify({ v: 1, type: "subscribe", conversationId, profileId }),
      t.ports,
    );
    expect(t.socket.closed).toBe(4400);
  });
  it("limits frame bursts across restored attachment reads", async () => {
    const s = setup();
    await auth(s);
    for (let i = 0; i < 35; i++)
      await core.receive(
        s.socket,
        JSON.stringify({ v: 1, type: "unsubscribe", conversationId }),
        s.ports,
      );
    expect(s.socket.closed).toBe(4429);
  });
});
