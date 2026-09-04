import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationList } from "./ConversationList";
import { HumanConversationDetail } from "./HumanConversationDetail";
import { realtimeEndpoint } from "../../lib/human-chat-client";

it("aborts pending history after a blocked send so denied messages cannot reappear", async () => {
  let resolveHistory!: (response: Response) => void;
  let count = 0;
  const revoked = vi.fn();
  const request = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST")
      return Response.json({ code: "HUMAN_CHAT_BLOCKED" }, { status: 403 });
    if (count++ === 0) return Response.json({ items: [message] });
    return new Promise<Response>((resolve) => {
      resolveHistory = resolve;
    });
  });
  vi.stubGlobal("fetch", request);
  const view = render(
    <HumanConversationDetail
      conversation={conversation}
      selfProfileId={self}
      labels={labels}
      locale="en"
      revision={0}
      onChanged={() => {}}
      onAccessRevoked={revoked}
    />,
  );
  await screen.findByText("Hello from Alice");
  view.rerender(
    <HumanConversationDetail
      conversation={conversation}
      selfProfileId={self}
      labels={labels}
      locale="en"
      revision={1}
      onChanged={() => {}}
      onAccessRevoked={revoked}
    />,
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Send while refreshing" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());
  await act(async () =>
    resolveHistory(
      Response.json({
        items: [
          {
            ...message,
            id: "66666666-6666-4666-8666-666666666666",
            sequence: 2,
            content: { kind: "text", text: "Late forbidden" },
          },
        ],
      }),
    ),
  );
  expect(screen.queryByText("Late forbidden")).toBeNull();
  expect(revoked).toHaveBeenCalledWith(id);
});
it("treats an authoritative blocked read response as revoked access, not a retryable receipt", async () => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const revoked = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/read")
        ? Response.json({ code: "HUMAN_CHAT_BLOCKED" }, { status: 403 })
        : Response.json({ items: [message] }),
    ),
  );
  render(
    <HumanConversationDetail
      conversation={conversation}
      selfProfileId={self}
      labels={labels}
      locale="en"
      revision={0}
      onChanged={() => {}}
      onAccessRevoked={revoked}
    />,
  );
  await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());
  expect(screen.queryByText("Hello from Alice")).toBeNull();
  expect(revoked).toHaveBeenCalledWith(id);
  vi.restoreAllMocks();
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const labels = {
  title: "Messages",
  chatTab: "Chats",
  notificationsTab: "Notifications",
  noConversations: "No conversations",
  emptyDescription: "Your conversations",
  emptyAction: "Explore",
  searchLabel: "Search conversations",
  searchPlaceholder: "Search",
  noSearchResults: "No results",
  partialSearchResults: "Load more to search",
  loadMore: "Load more",
  loadingMore: "Loading",
  loadMoreError: "Load failed",
  unavailableDescription: "Unavailable",
  unavailableAction: "Retry",
  unavailablePending: "Retrying",
  selectConversation: "Select a conversation",
  back: "Back",
  emptyHistory: "No messages yet",
  loadEarlierMessages: "Load earlier",
  messagePlaceholder: "Write a message",
  send: "Send",
  sending: "Sending",
  messageFailed: "Failed",
  retry: "Retry",
  providerUnavailable: "Provider unavailable",
  invalidResponse: "Invalid response",
  unavailable: "Unavailable",
};
const self = "11111111-1111-4111-8111-111111111111",
  peer = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
const conversation = {
  v: 1 as const,
  id,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  participants: [
    {
      kind: "HUMAN" as const,
      id: self,
      displayName: "Me",
      username: "myself",
      avatarUrl: null,
    },
    {
      kind: "HUMAN" as const,
      id: peer,
      displayName: "Alice",
      username: "alice",
      avatarUrl: null,
    },
  ] as [
    {
      kind: "HUMAN";
      id: string;
      displayName: string;
      username: string;
      avatarUrl: null;
    },
    {
      kind: "HUMAN";
      id: string;
      displayName: string;
      username: string;
      avatarUrl: null;
    },
  ],
};
const message = {
  v: 1 as const,
  id: "44444444-4444-4444-8444-444444444444",
  conversationId: id,
  senderProfileId: peer,
  clientRequestId: "55555555-5555-4555-8555-555555555555",
  sequence: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  content: { kind: "text" as const, text: "Hello from Alice" },
};
afterEach(() => vi.unstubAllGlobals());
it("mixes human and AI rows in timestamp order and searches both without fake empty messages", () => {
  render(
    <ConversationList
      items={[
        {
          id: self,
          ipProfile: { id: peer, displayName: "Luma", username: "luma" },
          lastMessage: {
            role: "assistant",
            body: "AI reply",
            createdAt: conversation.createdAt,
          },
          updatedAt: conversation.createdAt,
          sendEnabled: true,
        },
      ]}
      labels={labels}
      locale="en"
      humanItems={[
        {
          conversation: {
            ...conversation,
            updatedAt: "2026-09-02T00:00:00.000Z",
          },
          latestMessage: message,
          unreadCount: 3,
          lastReadSequence: 0,
        },
      ]}
      selfProfileId={self}
      selectedHumanId={id}
    />,
  );
  expect(screen.getByRole("link", { name: /Alice/ })).toHaveAttribute(
    "href",
    `/en/messages?humanConversation=${id}`,
  );
  expect(screen.getByRole("link", { name: /Alice/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByText("3")).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Alice" },
  });
  expect(screen.queryByText("AI reply")).toBeNull();
});
it("loads human history, sends text without the AI endpoint, and retries with the same idempotency key", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  let attempt = 0;
  let sent: typeof message | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/read"))
        return Response.json({
          conversationId: id,
          profileId: self,
          lastReadSequence: 1,
        });
      if (init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        calls.push({ url, body });
        attempt++;
        if (attempt === 1)
          return Response.json({ code: "TEMPORARY" }, { status: 503 });
        sent = {
          ...message,
          id: "66666666-6666-4666-8666-666666666666",
          senderProfileId: self,
          sequence: 2,
          content: { kind: "text", text: "Hello Alice" },
          clientRequestId: body.clientRequestId,
        };
        return Response.json({ message: sent });
      }
      return Response.json({
        items: url.includes("afterSequence=0") ? [message] : sent ? [sent] : [],
      });
    }),
  );
  render(
    <HumanConversationDetail
      conversation={conversation}
      selfProfileId={self}
      labels={labels}
      locale="en"
      revision={0}
      onChanged={() => {}}
    />,
  );
  expect(await screen.findByText("Hello from Alice")).toBeVisible();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Hello Alice" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("button", { name: "Retry" });
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[0]!.url).toBe(`/api/human-chat/peers/${peer}/messages`);
  expect(calls[0]!.body.clientRequestId).toBe(calls[1]!.body.clientRequestId);
  expect(await screen.findByText("Hello Alice")).toBeVisible();
});
it("does not acknowledge hidden history and aborts outstanding work on unmount", async () => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const request = vi
    .fn()
    .mockResolvedValue(Response.json({ items: [message] }));
  vi.stubGlobal("fetch", request);
  const view = render(
    <HumanConversationDetail
      conversation={conversation}
      selfProfileId={self}
      labels={labels}
      locale="en"
      revision={0}
      onChanged={() => {}}
    />,
  );
  await screen.findByText("Hello from Alice");
  expect(
    request.mock.calls.some(([url]) => String(url).endsWith("/read")),
  ).toBe(false);
  view.unmount();
  expect((request.mock.calls[0]![1] as RequestInit).signal?.aborted).toBe(true);
  vi.restoreAllMocks();
});
it("constructs a credential-free WSS endpoint from origin plus authenticated profile id only", () => {
  expect(realtimeEndpoint("wss://realtime.test", self)).toBe(
    `wss://realtime.test/connect/${self}`,
  );
  for (const value of [
    "ws://realtime.test",
    "wss://user:pass@realtime.test",
    "wss://realtime.test/token?secret=x",
    "wss://realtime.test/connect",
  ])
    expect(realtimeEndpoint(value, self)).toBeNull();
});
it("reuses the failed request key when Send is pressed again on the unchanged draft", async () => {
  const keys: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        keys.push(JSON.parse(init.body as string).clientRequestId);
        return Response.json({ code: "TEMPORARY" }, { status: 503 });
      }
      return Response.json({ items: [] });
    }),
  );
  render(
    <HumanConversationDetail
      conversation={conversation}
      selfProfileId={self}
      labels={labels}
      locale="en"
      revision={0}
      onChanged={() => {}}
    />,
  );
  await screen.findByText("No messages yet");
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "A message" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("button", { name: "Retry" });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(keys).toHaveLength(2));
  expect(keys[0]).toBe(keys[1]);
});
it("clears revoked history and disables the composer when catch-up is denied", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ items: [message] }))
    .mockImplementation(() =>
      Promise.resolve(
        Response.json({ code: "HUMAN_CHAT_BLOCKED" }, { status: 403 }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  const view = render(
    <HumanConversationDetail
      conversation={conversation}
      selfProfileId={self}
      labels={labels}
      locale="en"
      revision={0}
      onChanged={() => {}}
    />,
  );
  await screen.findByText("Hello from Alice");
  view.rerender(
    <HumanConversationDetail
      conversation={conversation}
      selfProfileId={self}
      labels={labels}
      locale="en"
      revision={1}
      onChanged={() => {}}
    />,
  );
  await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());
  expect(screen.queryByText("Hello from Alice")).toBeNull();
});
it("acknowledges visible focused history and does not invent peer read receipts", async () => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith("/read")
      ? Response.json({
          conversationId: id,
          profileId: self,
          lastReadSequence: 1,
        })
      : Response.json({ items: [message] }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <HumanConversationDetail
      conversation={conversation}
      selfProfileId={self}
      labels={labels}
      locale="en"
      revision={0}
      onChanged={() => {}}
    />,
  );
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("/read"))).toBe(
      true,
    ),
  );
  expect(screen.queryByText("Read")).toBeNull();
  vi.restoreAllMocks();
});
it("does not mark a new message read while the reader is scrolled away from the latest message", async () => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  let historyCalls = 0;
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("/read"))
      return Response.json({
        conversationId: id,
        profileId: self,
        lastReadSequence: historyCalls,
      });
    historyCalls++;
    return Response.json({
      items: [
        {
          ...message,
          id:
            historyCalls === 1
              ? message.id
              : "66666666-6666-4666-8666-666666666666",
          sequence: historyCalls,
          content: {
            kind: "text",
            text: historyCalls === 1 ? "Hello from Alice" : "New while reading",
          },
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const view = render(
    <HumanConversationDetail
      conversation={conversation}
      selfProfileId={self}
      labels={labels}
      locale="en"
      revision={0}
      onChanged={() => {}}
    />,
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([url]) => url.endsWith("/read")),
    ).toHaveLength(1),
  );
  const area = screen.getByRole("list").parentElement!;
  Object.defineProperties(area, {
    scrollHeight: { value: 1200, configurable: true },
    clientHeight: { value: 300, configurable: true },
    scrollTop: { value: 0, writable: true, configurable: true },
  });
  fireEvent.scroll(area);
  view.rerender(
    <HumanConversationDetail
      conversation={conversation}
      selfProfileId={self}
      labels={labels}
      locale="en"
      revision={1}
      onChanged={() => {}}
    />,
  );
  await screen.findByText("New while reading");
  expect(
    fetcher.mock.calls.filter(([url]) => url.endsWith("/read")),
  ).toHaveLength(1);
  area.scrollTop = 900;
  fireEvent.scroll(area);
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([url]) => url.endsWith("/read")),
    ).toHaveLength(2),
  );
  vi.restoreAllMocks();
});
