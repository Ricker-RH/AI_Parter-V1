import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createR2PostMediaPort } from "./r2-post-media.js";

const configuration = {
  accountId: "0".repeat(32),
  accessKeyId: "access",
  secretAccessKey: "secret",
  bucket: "public-media",
  publicBaseUrl: "https://media.example",
  endpoint: "https://r2.example",
};
describe("R2 public post media adapter", () => {
  it("binds random public key, exact MIME and length into a short PUT intent", async () => {
    const sign = vi.fn(async () => "https://signed.example/upload");
    const inspect = vi.fn();
    const port = createR2PostMediaPort(configuration, {
      sign,
      inspect,
      now: () => new Date("2026-09-01T00:00:00Z"),
    });
    const id = randomUUID();
    await expect(
      port.createUploadIntent({
        objectKey: `public/posts/${id}.png`,
        contentType: "image/png",
        sizeBytes: 4096,
        expiresAt: "2026-09-01T00:05:00Z",
      }),
    ).resolves.toMatchObject({
      method: "PUT",
      headers: { "content-type": "image/png" },
      maxBytes: 10_485_760,
    });
    expect(sign).toHaveBeenCalledWith({
      bucket: "public-media",
      key: `public/posts/${id}.png`,
      contentType: "image/png",
      contentLength: 4096,
      expiresIn: 300,
    });
    await expect(
      port.createUploadIntent({
        objectKey: `private/creator/${id}.png`,
        contentType: "image/png",
        sizeBytes: 4096,
        expiresAt: "2026-09-01T00:05:00Z",
      }),
    ).rejects.toThrow();
  });
  it("accepts only an exact HEAD match and rejects missing, MIME, or length mismatches", async () => {
    const id = randomUUID(),
      input = {
        objectKey: `public/posts/${id}.webp`,
        contentType: "image/webp" as const,
        sizeBytes: 1200,
      };
    for (const metadata of [
      null,
      { contentType: "image/png", sizeBytes: 1200 },
      { contentType: "image/webp", sizeBytes: 1199 },
    ]) {
      const port = createR2PostMediaPort(configuration, {
        sign: vi.fn(),
        inspect: vi.fn(async () => metadata),
      });
      await expect(port.inspectUpload(input)).rejects.toThrow();
    }
    const port = createR2PostMediaPort(configuration, {
      sign: vi.fn(),
      inspect: vi.fn(async () => ({
        contentType: "image/webp",
        sizeBytes: 1200,
      })),
    });
    await expect(port.inspectUpload(input)).resolves.toEqual({
      contentType: "image/webp",
      sizeBytes: 1200,
    });
  });
});
