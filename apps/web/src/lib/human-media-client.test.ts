import { afterEach, expect, it, vi } from "vitest";
import { uploadHumanMedia, mediaContentType } from "./human-media-client";
afterEach(() => vi.unstubAllGlobals());
it("normalizes native recording MIME and rejects unsupported media", () => {
  expect(
    mediaContentType(
      new Blob(["voice"], { type: "audio/webm;codecs=opus" }),
      "voice",
    ),
  ).toBe("audio/webm");
  expect(() =>
    mediaContentType(new Blob(["x"], { type: "audio/ogg" }), "voice"),
  ).toThrow();
  expect(() =>
    mediaContentType(new Blob([], { type: "image/jpeg" }), "image"),
  ).toThrow();
});
it("reserves, uploads without credentials, and finalizes before returning an attachment", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const attachment = {
    attachmentId: id,
    kind: "voice",
    contentType: "audio/webm",
    sizeBytes: 5,
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        attachmentId: id,
        upload: {
          method: "PUT",
          url: "https://assets.test/private",
          headers: { "content-type": "audio/webm" },
          expiresAt: "2099-01-01T00:00:00Z",
          maxBytes: 10485760,
        },
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(Response.json(attachment));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await uploadHumanMedia(
      id,
      new Blob(["voice"], { type: "audio/webm;codecs=opus" }),
      "voice",
      new AbortController().signal,
    ),
  ).toEqual(attachment);
  expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
    method: "PUT",
    credentials: "omit",
    headers: { "content-type": "audio/webm" },
  });
  expect(fetcher.mock.calls[2]?.[0]).toBe(
    `/api/human-chat/attachments/${id}/finalize`,
  );
});
