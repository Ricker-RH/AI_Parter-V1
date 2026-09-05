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
import { HumanChatQueryProvider } from "./HumanChatQueryProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const id = "11111111-1111-4111-8111-111111111111";
it("reuses downloaded image bytes after re-entry while rechecking authorization", async () => {
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:cached-image");
    static revokeObjectURL = vi.fn();
  });
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  const fetcher = vi.fn(async (url: string) => url.startsWith("https:")
    ? new Response("image", {headers: {"content-type": "image/webp"}})
    : Response.json({url: "https://assets.test/image", expiresAt: new Date(Date.now() + 60_000).toISOString(), attachment: {attachmentId: id, kind: "image", contentType: "image/webp", sizeBytes: 5, width: 10, height: 10}}));
  vi.stubGlobal("fetch", fetcher);
  const ui = <QueryClientProvider client={client}><HumanMediaMessage selfProfileId={id} attachmentId={id} kind="image" zh={false} onError={() => {}} /></QueryClientProvider>;
  const first = render(ui);
  await waitFor(() => expect(screen.getByAltText("Chat image")).toHaveAttribute("src", "blob:cached-image"));
  first.unmount();
  render(ui);
  await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => url.startsWith("/api/"))).toHaveLength(2));
  expect(fetcher.mock.calls.filter(([url]) => url.startsWith("https:"))).toHaveLength(1);
  expect(screen.getByAltText("Chat image")).toHaveAttribute("src", "blob:cached-image");
});
function renderMedia(props: Omit<Parameters<typeof HumanMediaMessage>[0], "selfProfileId">) {
  return render(
    <HumanChatQueryProvider profileId={id}>
      <HumanMediaMessage selfProfileId={id} {...props} />
    </HumanChatQueryProvider>,
  );
}
it("loads private images only through the authenticated download endpoint", async () => {
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
  const view = renderMedia({ attachmentId: id, kind: "image", zh: false, onError() {} });
  expect(await screen.findByAltText("Chat image")).toHaveAttribute(
    "referrerpolicy",
    "no-referrer",
  );
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    `/api/human-chat/attachments/${id}/download`,
  );
  view.unmount();
});
it("shares an in-memory private attachment descriptor across message remounts", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      url: "https://assets.test/short-lived",
      expiresAt: "2099-01-01T00:00:00Z",
      attachment: { attachmentId: id, kind: "image", contentType: "image/webp", sizeBytes: 10, width: 10, height: 10 },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <HumanChatQueryProvider profileId={id}>
      <HumanMediaMessage selfProfileId={id} attachmentId={id} kind="image" zh={false} onError={() => {}} />
      <HumanMediaMessage selfProfileId={id} attachmentId={id} kind="image" zh={false} onError={() => {}} />
    </HumanChatQueryProvider>,
  );
  await waitFor(() => expect(screen.getAllByAltText("Chat image")).toHaveLength(2));
  expect(fetcher.mock.calls.filter(([url]) => String(url).startsWith("/api/"))).toHaveLength(1);
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
  const view = renderMedia({ attachmentId: id, kind: "voice", zh: false, onError() {} });
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
it("does not replace a voice source on a timer during playback", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => Response.json({
    url: "https://assets.test/voice", expiresAt: new Date(Date.now() + 60_000).toISOString(),
    attachment: {attachmentId: id, kind: "voice", contentType: "audio/mp4", sizeBytes: 10},
  }));
  vi.stubGlobal("fetch", fetcher);
  try {
    const view = renderMedia({attachmentId: id, kind: "voice", zh: false, onError() {}});
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    fireEvent.play(view.container.querySelector("audio")!);
    await act(async () => { await vi.advanceTimersByTimeAsync(50_000); });
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
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
  renderMedia({ attachmentId: id, kind: "voice", zh: false, onError: error });
  await waitFor(() =>
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ message: "HUMAN_CHAT_BLOCKED" }),
    ),
  );
  expect(
    screen.getByRole("button", { name: "Reload attachment" }),
  ).toBeTruthy();
});
