import { expect, it } from "vitest";
import * as gateway from "./gateway.js";
const profile = "11111111-1111-4111-8111-111111111111";
const env = {
  ALLOWED_ORIGINS: "https://app.example",
  UPSTREAM_API_URL: "https://api.example",
  REALTIME_INTERNAL_SECRET: "x".repeat(32),
};
it("exports fail-closed request admission", () =>
  expect(gateway.admit).toBeTypeOf("function"));
it("enforces streamed body byte limit without content-length", async () => {
  await expect(
    gateway.boundedJson(new Response("x".repeat(16385))),
  ).rejects.toThrow("body too large");
  await expect(
    gateway.boundedJson(new Response('{"ok":true}')),
  ).resolves.toEqual({ ok: true });
});
it("rejects missing config, origins, credential query strings and wrong methods", () => {
  expect(
    gateway.admit(new Request(`https://ws.example/connect/${profile}`), {}),
  ).toEqual({ status: 503 });
  for (const headers of [
    { Upgrade: "websocket" },
    { Upgrade: "websocket", Origin: "https://evil.example" },
  ])
    expect(
      gateway.admit(
        new Request(`https://ws.example/connect/${profile}`, { headers }),
        env,
      ),
    ).toEqual({ status: 403 });
  expect(
    gateway.admit(
      new Request(`https://ws.example/connect/${profile}?ticket=secret`, {
        headers: { Upgrade: "websocket", Origin: "https://app.example" },
      }),
      env,
    ),
  ).toEqual({ status: 400 });
  expect(
    gateway.admit(
      new Request(`https://ws.example/connect/${profile}`, {
        headers: { Upgrade: "websocket", Origin: "https://app.example" },
      }),
      env,
    ),
  ).toEqual({
    profileId: profile,
    kind: "connect",
    origin: "https://app.example",
  });
});
it("internal fanout requires shared secret and strict profile routing", () => {
  expect(
    gateway.admit(
      new Request(`https://ws.example/internal/events/${profile}`, {
        method: "POST",
      }),
      env,
    ),
  ).toEqual({ status: 403 });
  expect(
    gateway.admit(
      new Request(`https://ws.example/internal/events/${profile}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.REALTIME_INTERNAL_SECRET}` },
      }),
      env,
    ),
  ).toEqual({ profileId: profile, kind: "event" });
});
