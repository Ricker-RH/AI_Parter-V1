import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/server-api", () => ({ fetchAifansApi: upstream }));
afterEach(() => upstream.mockReset());
it("issues a no-store ticket with only the validated browser origin", async () => {
  upstream.mockResolvedValue(Response.json({ ticket: "one-time-ticket" }));
  const response = await POST(
    new Request("https://app.test/api/realtime/ticket", {
      method: "POST",
      headers: {
        origin: "https://app.test",
        "content-type": "application/json",
      },
      body: "{}",
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(upstream).toHaveBeenCalledWith(
    "/v1/realtime/ticket",
    expect.objectContaining({ trustedOrigin: "https://app.test" }),
  );
});
it("never forwards hostile or missing Origin", async () => {
  for (const origin of ["", "https://evil.test"])
    expect(
      (
        await POST(
          new Request("https://app.test/api/realtime/ticket", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});
