import { expect, it } from "vitest";
import * as admission from "./admission.js";
it("exports pre-object edge admission", () =>
  expect(admission.edgeAdmission).toBeTypeOf("function"));
it("fails closed without native limiter or trusted edge IP; ignores spoofed XFF", async () => {
  expect(await admission.edgeAdmission(new Request("https://ws.example"))).toBe(
    503,
  );
  expect(
    await admission.edgeAdmission(
      new Request("https://ws.example", {
        headers: { "X-Forwarded-For": "203.0.113.1" },
      }),
      { limit: async () => ({ success: true }) },
    ),
  ).toBe(403);
});
it("keys admission on edge IP across arbitrary mailbox paths", async () => {
  const keys: string[] = [];
  const limiter = {
    limit: async ({ key }: { key: string }) => {
      keys.push(key);
      return { success: keys.length === 1 };
    },
  };
  expect(
    await admission.edgeAdmission(
      new Request("https://ws.example/connect/a", {
        headers: { "CF-Connecting-IP": "203.0.113.7" },
      }),
      limiter,
    ),
  ).toBeNull();
  expect(
    await admission.edgeAdmission(
      new Request("https://ws.example/connect/b", {
        headers: { "CF-Connecting-IP": "203.0.113.7" },
      }),
      limiter,
    ),
  ).toBe(429);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[0]).toContain("203.0.113.7");
});
it("fails closed on limiter errors and malformed IP", async () => {
  expect(
    await admission.edgeAdmission(
      new Request("https://ws.example", {
        headers: { "CF-Connecting-IP": "203.0.113.7" },
      }),
      {
        limit: async () => {
          throw new Error("failure");
        },
      },
    ),
  ).toBe(503);
  expect(
    await admission.edgeAdmission(
      new Request("https://ws.example", {
        headers: { "CF-Connecting-IP": "unknown" },
      }),
      { limit: async () => ({ success: true }) },
    ),
  ).toBe(403);
});
