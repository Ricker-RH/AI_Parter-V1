import { afterEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/server-api", () => ({ fetchAifansApi: upstream }));
afterEach(() => upstream.mockReset());
const id = "11111111-1111-4111-8111-111111111111";
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
it("rejects cross-origin and unrecognized paths without contacting API", async () => {
  expect(
    (
      await POST(
        new Request("https://app.test/api/human-chat/conversations", {
          method: "POST",
          headers: { origin: "https://evil.test" },
        }),
        context(["conversations"]),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await GET(
        new Request("https://app.test/api/human-chat/internal"),
        context(["internal"]),
      )
    ).status,
  ).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
});
it("forwards a validated text send and preserves idempotency UUID", async () => {
  const message = {
    v: 1,
    id,
    conversationId: id,
    senderProfileId: id,
    clientRequestId: id,
    sequence: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
    content: { kind: "text", text: "Hello" },
  };
  upstream.mockResolvedValue(Response.json({ message }));
  const response = await POST(
    new Request(`https://app.test/api/human-chat/peers/${id}/messages`, {
      method: "POST",
      headers: {
        origin: "https://app.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ clientRequestId: id, content: message.content }),
    }),
    context(["peers", id, "messages"]),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(upstream).toHaveBeenCalledWith(
    `/v1/human-chat/peers/${id}/messages`,
    expect.objectContaining({
      policy: "live-no-store",
      requestInit: expect.objectContaining({
        body: JSON.stringify({ clientRequestId: id, content: message.content }),
      }),
    }),
  );
});
it("rejects duplicate paging fields and malformed response shapes", async () => {
  expect(
    (
      await GET(
        new Request(
          "https://app.test/api/human-chat/conversations?limit=1&limit=2",
        ),
        context(["conversations"]),
      )
    ).status,
  ).toBe(400);
  upstream.mockResolvedValue(
    Response.json({ items: [], nextCursor: null, secret: "leak" }),
  );
  expect(
    (
      await GET(
        new Request("https://app.test/api/human-chat/conversations"),
        context(["conversations"]),
      )
    ).status,
  ).toBe(502);
});
