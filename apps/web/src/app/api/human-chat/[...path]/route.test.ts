import { afterEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/server-api", () => ({ fetchAifansApi: upstream }));
afterEach(() => upstream.mockReset());
it("forwards attachment intent and forbids attachment query parameters", async () => {
  const attachmentId = "11111111-1111-4111-8111-111111111111";
  upstream.mockResolvedValue(
    Response.json({
      attachmentId,
      upload: {
        method: "PUT",
        url: "https://assets.test/private",
        headers: { "content-type": "audio/webm" },
        expiresAt: "2099-01-01T00:00:00Z",
        maxBytes: 10485760,
      },
    }),
  );
  expect(
    (
      await POST(
        new Request(
          "https://app.test/api/human-chat/peers/" +
            attachmentId +
            "/attachments",
          {
            method: "POST",
            headers: {
              origin: "https://app.test",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              kind: "voice",
              contentType: "audio/webm",
              sizeBytes: 5,
            }),
          },
        ),
        context(["peers", attachmentId, "attachments"]),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await GET(
        new Request(
          "https://app.test/api/human-chat/attachments/" +
            attachmentId +
            "/download?limit=1",
        ),
        context(["attachments", attachmentId, "download"]),
      )
    ).status,
  ).toBe(400);
});
const id = "11111111-1111-4111-8111-111111111111";
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
it("validates finalized/download metadata and rejects caller-supplied attachment authority", async () => {
  const attachment = {
    attachmentId: id,
    kind: "image",
    contentType: "image/webp",
    sizeBytes: 10,
    width: 10,
    height: 10,
  };
  const request = (body: unknown) =>
    new Request(`https://app.test/api/human-chat/attachments/${id}/finalize`, {
      method: "POST",
      headers: {
        origin: "https://app.test",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  expect(
    (
      await POST(
        request({ ownerProfileId: id }),
        context(["attachments", id, "finalize"]),
      )
    ).status,
  ).toBe(422);
  expect(upstream).not.toHaveBeenCalled();
  upstream.mockResolvedValueOnce(Response.json(attachment));
  expect(
    await (
      await POST(request({}), context(["attachments", id, "finalize"]))
    ).json(),
  ).toEqual(attachment);
  upstream.mockResolvedValueOnce(
    Response.json({
      url: "https://assets.test/private?signature=short",
      expiresAt: "2099-01-01T00:00:00Z",
      attachment,
    }),
  );
  const response = await GET(
    new Request(`https://app.test/api/human-chat/attachments/${id}/download`),
    context(["attachments", id, "download"]),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("accepts attachment messages but continues rejecting unsupported shares", async () => {
  const message = {
    v: 1,
    id,
    conversationId: id,
    senderProfileId: id,
    clientRequestId: id,
    sequence: 1,
    createdAt: "2026-09-01T00:00:00Z",
    content: { kind: "voice", attachmentId: id },
  };
  const request = (content: unknown) =>
    new Request(`https://app.test/api/human-chat/peers/${id}/messages`, {
      method: "POST",
      headers: {
        origin: "https://app.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ clientRequestId: id, content }),
    });
  upstream.mockResolvedValueOnce(Response.json({ message }));
  expect(
    (await POST(request(message.content), context(["peers", id, "messages"])))
      .status,
  ).toBe(200);
  expect(
    (
      await POST(
        request({ kind: "share", target: { kind: "human", id } }),
        context(["peers", id, "messages"]),
      )
    ).status,
  ).toBe(422);
});
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
