import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Use the already pinned Wrangler toolchain; do not install another runtime.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire("miniflare");
const { build } = wranglerRequire("esbuild");
const profileId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";
const secret = "local-runtime-test-only-not-a-deployed-secret";
const origin = "https://app.example";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 250; i++) {
    if (predicate()) return;
    await pause(20);
  }
  throw new Error("runtime condition timed out");
}

test(
  "actual workerd: origin-bound auth, session subscription, fanout and current block denial",
  { timeout: 30000 },
  async () => {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2024",
      external: ["cloudflare:workers"],
    });
    let allowed = true;
    const requests = [];
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        name: "aifans-realtime-isolated-test",
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: "2026-09-04",
        cf: false,
        bindings: {
          ALLOWED_ORIGINS: origin,
          UPSTREAM_API_URL: "https://api.example",
          REALTIME_INTERNAL_SECRET: secret,
        },
        durableObjects: {
          MAILBOXES: { className: "RealtimeMailbox", useSQLite: true },
        },
        ratelimits: {
          ADMISSION_LIMITER: {
            namespace_id: "2026090401",
            simple: { limit: 10, period: 10 },
          },
        },
        outboundService: async (request) => {
          assert.equal(
            request.headers.get("Authorization"),
            `Bearer ${secret}`,
          );
          const body = await request.json();
          requests.push({ path: new URL(request.url).pathname, body });
          if (request.url.endsWith("/redeem")) {
            assert.equal(body.origin, origin);
            if (body.ticket === "redirect")
              return Response.redirect("https://unexpected.example", 302);
            return Response.json({
              subject: "runtime-subject",
              profileId: body.ticket === "invalid" ? conversationId : profileId,
              sessionId,
              sessionExpiresAt:
                Date.now() + (body.ticket === "short" ? 1000 : 60000),
            });
          }
          assert.equal(body.subject, "runtime-subject");
          assert.equal(body.profileId, profileId);
          assert.equal(body.sessionId, sessionId);
          assert.equal(body.conversationId, conversationId);
          return Response.json({ allowed, presenceAllowed: false });
        },
      }),
    );
    const sockets = [];
    try {
      const endpoint = `https://ws.example/connect/${profileId}`;
      assert.equal(
        (
          await mf.dispatchFetch(endpoint, {
            headers: { Upgrade: "websocket", Origin: "https://evil.example" },
          })
        ).status,
        403,
      );
      const response = await mf.dispatchFetch(endpoint, {
        headers: {
          Upgrade: "websocket",
          Origin: origin,
          "CF-Connecting-IP": "203.0.113.1",
        },
      });
      assert.equal(response.status, 101);
      const ws = response.webSocket;
      assert.ok(ws);
      sockets.push(ws);
      ws.accept();
      const messages = [];
      ws.addEventListener("message", (event) =>
        messages.push(JSON.parse(event.data)),
      );
      ws.send(JSON.stringify({ v: 1, type: "auth", ticket: "valid" }));
      await until(() => messages.length > 0);
      assert.deepEqual(
        messages[0],
        { v: 1, type: "auth_ok" },
        `auth response; upstream requests: ${requests.map((request) => request.path).join(",")}`,
      );
      ws.send(JSON.stringify({ v: 1, type: "subscribe", conversationId }));
      await until(() =>
        requests.some((request) => request.path.endsWith("/authorize")),
      );
      const event = {
        v: 1,
        eventId: "44444444-4444-4444-8444-444444444444",
        conversationId,
        occurredAt: "2026-09-04T00:00:00Z",
        type: "typing",
        profileId,
        isTyping: true,
      };
      const publish = (value, authenticated = true) =>
        mf.dispatchFetch(`https://ws.example/internal/events/${profileId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authenticated ? { Authorization: `Bearer ${secret}` } : {}),
          },
          body: JSON.stringify(value),
        });
      assert.equal((await publish(event, false)).status, 403);
      assert.equal((await publish(event)).status, 204);
      await until(() => messages.some((message) => message.type === "typing"));
      const { isTyping, ...base } = event;
      assert.equal(
        (await publish({ ...base, type: "presence", status: "online" })).status,
        204,
      );
      await pause(100);
      assert.equal(
        messages.some((message) => message.type === "presence"),
        false,
      );
      allowed = false;
      assert.equal(
        (
          await publish({
            ...event,
            eventId: "55555555-5555-4555-8555-555555555555",
          })
        ).status,
        204,
      );
      await pause(100);
      assert.equal(
        messages.filter((message) => message.type === "typing").length,
        1,
      );
      assert.ok(
        requests.filter((request) => request.path.endsWith("/authorize"))
          .length >= 3,
      );
      const denied = await mf.dispatchFetch(endpoint, {
        headers: {
          Upgrade: "websocket",
          Origin: origin,
          "CF-Connecting-IP": "203.0.113.2",
        },
      });
      const deniedWs = denied.webSocket;
      assert.ok(deniedWs);
      sockets.push(deniedWs);
      deniedWs.accept();
      const denial = [];
      deniedWs.addEventListener("message", (event) =>
        denial.push(JSON.parse(event.data)),
      );
      deniedWs.send(JSON.stringify({ v: 1, type: "auth", ticket: "invalid" }));
      await until(() =>
        denial.some((message) => message.type === "auth_error"),
      );
      for (const ticket of ["redirect", "short"]) {
        const r = await mf.dispatchFetch(endpoint, {
          headers: {
            Upgrade: "websocket",
            Origin: origin,
            "CF-Connecting-IP": "203.0.113.3",
          },
        });
        const socket = r.webSocket;
        assert.ok(socket);
        sockets.push(socket);
        socket.accept();
        const events = [];
        let closed;
        socket.addEventListener("message", (event) =>
          events.push(JSON.parse(event.data)),
        );
        socket.addEventListener("close", (event) => {
          closed = event.code;
        });
        socket.send(JSON.stringify({ v: 1, type: "auth", ticket }));
        if (ticket === "redirect")
          await until(() =>
            events.some((event) => event.type === "auth_error"),
          );
        else {
          await until(() => events.some((event) => event.type === "auth_ok"));
          await until(() => closed === 4408);
        }
      }
      assert.equal(
        requests.some((request) => request.path === "/"),
        false,
        "upstream redirect must never be followed",
      );
    } finally {
      for (const socket of sockets) socket.close();
      await mf.dispose();
    }
  },
);
