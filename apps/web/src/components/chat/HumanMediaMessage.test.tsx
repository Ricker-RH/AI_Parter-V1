import {
  render,
  act,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HumanMediaMessage } from "./HumanMediaMessage";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const id = "11111111-1111-4111-8111-111111111111";
it("loads private images only through the authenticated download endpoint and aborts on unmount", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      url: "https://assets.test/short-lived",
      expiresAt: "2099-01-01T00:00:00Z",
      attachment: {
        attachmentId: id,
        kind: "image",
        contentType: "image/webp",
        sizeBytes: 10,
        width: 10,
        height: 10,
      },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const view = render(
    <HumanMediaMessage
      attachmentId={id}
      kind="image"
      zh={false}
      onError={() => {}}
    />,
  );
  expect(await screen.findByAltText("Chat image")).toHaveAttribute(
    "referrerpolicy",
    "no-referrer",
  );
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    `/api/human-chat/attachments/${id}/download`,
  );
  view.unmount();
  expect(fetcher.mock.calls[0]?.[1].signal.aborted).toBe(true);
});
it("refreshes expired voice authorization on playback before resuming", async () => {
  const expiredAt = Date.now() + 60000;
  let resolveRenewal!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementation(() => {
    const response = Response.json({
        url: `https://assets.test/private-${fetcher.mock.calls.length}`,
        expiresAt: new Date(
          fetcher.mock.calls.length === 1 ? expiredAt : Date.now() + 60000,
        ).toISOString(),
        attachment: {
          attachmentId: id,
          kind: "voice",
          contentType: "audio/webm",
          sizeBytes: 10,
        },
      });
    return fetcher.mock.calls.length === 1 ? Promise.resolve(response) : new Promise<Response>((resolve) => { resolveRenewal = resolve; });
  });
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const view = render(
    <HumanMediaMessage
      attachmentId={id}
      kind="voice"
      zh={false}
      onError={() => {}}
    />,
  );
  await waitFor(() =>
    expect(view.container.querySelector("audio")).toBeTruthy(),
  );
  vi.spyOn(Date, "now").mockReturnValue(expiredAt + 1);
  fireEvent.play(view.container.querySelector("audio")!);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(view.container.querySelector("audio")).toBeTruthy();
  expect(screen.queryByText("Loading attachment…")).toBeNull();
  await act(async () => resolveRenewal(Response.json({
    url: "https://assets.test/private-renewed",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    attachment: {attachmentId: id, kind: "voice", contentType: "audio/webm", sizeBytes: 10},
  })));
  await waitFor(() =>
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled(),
  );
});
it("reports revoked attachment access instead of showing a stale URL", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ code: "HUMAN_CHAT_BLOCKED" }, { status: 403 }),
      ),
  );
  const error = vi.fn();
  render(
    <HumanMediaMessage
      attachmentId={id}
      kind="voice"
      zh={false}
      onError={error}
    />,
  );
  await waitFor(() =>
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ message: "HUMAN_CHAT_BLOCKED" }),
    ),
  );
  expect(
    screen.getByRole("button", { name: "Reload attachment" }),
  ).toBeTruthy();
});
