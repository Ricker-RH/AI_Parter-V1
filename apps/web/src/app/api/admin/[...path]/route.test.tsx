import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../../lib/auth/server.js", () => ({
  getApiBearerToken: vi.fn(async () => "signed-jwt"),
}));
import * as route from "./route.js";

const postId = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AIFANS_API_URL;
  delete process.env.NEXT_PUBLIC_AIFANS_API_URL;
  delete process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET;
});

function request(path: string, body: object = { body: "Hello" }) {
  return new Request(`https://web.example/api/admin/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "session=real",
      "x-request-id": "req-123",
      origin: "https://web.example",
    },
    body: JSON.stringify(body),
  });
}

describe("same-origin operator proxy", () => {
  it.each([
    ["ips", ["ips"]],
    ["posts", ["posts"]],
    ["post-media/upload-intents", ["post-media", "upload-intents"]],
    [`post-media/${postId}/register`, ["post-media", postId, "register"]],
    [`posts/${postId}/comments`, ["posts", postId, "comments"]],
  ])(
    "forwards the approved POST shape /%s with auth and correlation headers",
    async (path, parts) => {
      process.env.AIFANS_API_URL = "https://internal-api.example/";
      process.env.NEXT_PUBLIC_AIFANS_API_URL =
        "https://public-must-not-be-used.example";
      const upstream = vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { id: postId },
            { status: 201, headers: { "x-request-id": "req-upstream" } },
          ),
        );
      vi.stubGlobal("fetch", upstream);

      const response = await route.POST(request(path), {
        params: Promise.resolve({ path: parts }),
      });

      expect(response.status).toBe(201);
      expect(response.headers.get("x-request-id")).toBe("req-upstream");
      expect(upstream).toHaveBeenCalledOnce();
      const [url, options] = upstream.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(`https://internal-api.example/v1/admin/${path}`);
      expect(options).toEqual(
        expect.objectContaining({
          cache: "no-store",
          method: "POST",
          headers: {
            authorization: "Bearer signed-jwt",
            "content-type": "application/json",
            "x-request-id": "req-123",
          },
          body: JSON.stringify({ body: "Hello" }),
        }),
      );
    },
  );

  it.each([
    [["delete"]],
    [["ips", "extra"]],
    [["posts", "not-a-uuid", "comments"]],
    [["posts", postId, "comments", "extra"]],
  ])("rejects path parts outside the exact allowlist: %j", async (parts) => {
    process.env.AIFANS_API_URL = "https://internal-api.example";
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await route.POST(request(parts.join("/")), {
      params: Promise.resolve({ path: parts }),
    });
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects query strings and exposes no non-POST handler", async () => {
    process.env.AIFANS_API_URL = "https://internal-api.example";
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const withQuery = new Request(
      "https://web.example/api/admin/ips?source=forged",
      { method: "POST", body: "{}" },
    );
    const response = await route.POST(withQuery, {
      params: Promise.resolve({ path: ["ips"] }),
    });
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
    expect("PUT" in route).toBe(false);
    expect("DELETE" in route).toBe(false);
  });

  it('creates a trusted identity without forwarding browser credentials or forged identity headers', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example';
    process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET = 's'.repeat(32);
    const upstream = vi.fn().mockResolvedValue(Response.json({id: postId}));
    vi.stubGlobal('fetch', upstream);
    const input = request('ips');
    input.headers.set('authorization', 'Bearer forged');
    input.headers.set('x-aifans-rate-limit-identity', 'forged');
    input.headers.set('x-vercel-forwarded-for', '203.0.113.7, 10.0.0.1');
    await route.POST(input, {params: Promise.resolve({path: ['ips']})});
    const headers = new Headers((upstream.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get('x-aifans-rate-limit-identity')).toMatch(/^v1\.\d+\.[a-f0-9]{64}\.[a-f0-9]{64}$/);
    expect(headers.get('authorization')).toBe('Bearer signed-jwt');
    for (const name of ['cookie', 'x-vercel-forwarded-for']) expect(headers.has(name)).toBe(false);
  });

  it("fails safely without server configuration or when the upstream is unreachable", async () => {
    const upstream = vi
      .fn()
      .mockRejectedValue(new Error("private network detail"));
    vi.stubGlobal("fetch", upstream);
    expect(
      (
        await route.POST(request("ips"), {
          params: Promise.resolve({ path: ["ips"] }),
        })
      ).status,
    ).toBe(503);
    process.env.AIFANS_API_URL = "https://internal-api.example";
    const response = await route.POST(request("ips"), {
      params: Promise.resolve({ path: ["ips"] }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "ADMIN_UNAVAILABLE" });
  });

  it("enforces same-origin CSRF and a bounded body before contacting the API", async () => {
    process.env.AIFANS_API_URL = "https://internal-api.example";
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const parts = ["post-media", "upload-intents"];
    const crossOrigin = new Request(
      "https://web.example/api/admin/post-media/upload-intents",
      {
        method: "POST",
        headers: { origin: "https://attacker.example" },
        body: "{}",
      },
    );
    expect(
      (
        await route.POST(crossOrigin, {
          params: Promise.resolve({ path: parts }),
        })
      ).status,
    ).toBe(403);
    const oversized = new Request(
      "https://web.example/api/admin/post-media/upload-intents",
      {
        method: "POST",
        headers: { origin: "https://web.example", "content-length": "70000" },
        body: "{}",
      },
    );
    expect(
      (
        await route.POST(oversized, {
          params: Promise.resolve({ path: parts }),
        })
      ).status,
    ).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
});
