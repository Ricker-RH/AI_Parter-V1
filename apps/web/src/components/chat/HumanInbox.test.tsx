import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { encodeHumanInboxCursor } from "@aifans/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { MessagesWorkspace } from "./MessagesWorkspace";
import type { RealtimeTransportOptions } from "../../lib/realtime-transport";
const mocks = vi.hoisted(() => ({
  account: { id: "11111111-1111-4111-8111-111111111111", kind: "human" },
  status: "authenticated",
  options: null as RealtimeTransportOptions | null,
  dispose: vi.fn(),
  send: vi.fn(),
  connect: vi.fn(),
}));
vi.mock("../account/CurrentAccountProvider", () => ({
  useOptionalCurrentAccount: () => ({
    account: mocks.account,
    status: mocks.status,
  }),
}));
vi.mock("../../lib/realtime-transport", () => ({
  createRealtimeTransport: (options: RealtimeTransportOptions) => {
    mocks.options = options;
    return { dispose: mocks.dispose, send: mocks.send, connect: mocks.connect };
  },
}));
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
  v: 1,
  id,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  participants: [
    {
      kind: "HUMAN",
      id: self,
      displayName: "Me",
      username: "myself",
      avatarUrl: null,
    },
    {
      kind: "HUMAN",
      id: peer,
      displayName: "Alice",
      username: "alice",
      avatarUrl: null,
    },
  ],
};
it("shows only fresh peer presence and clears transient state on disconnect", async () => {
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.test");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        Response.json(
          url.includes("/messages?")
            ? { items: [] }
            : {
                items: [
                  {
                    conversation,
                    latestMessage: null,
                    unreadCount: 0,
                    lastReadSequence: 0,
                  },
                ],
                nextCursor: null,
              },
        ),
      ),
    ),
  );
  render(
    <MessagesWorkspace
      items={[]}
      labels={labels}
      locale="en"
      selectedHumanId={id}
    />,
  );
  await screen.findByRole("heading", { name: "Alice" });
  const event = {
    v: 1 as const,
    eventId: self,
    conversationId: id,
    occurredAt: new Date().toISOString(),
    type: "presence" as const,
    profileId: peer,
    status: "online" as const,
  };
  act(() => mocks.options?.onEvent(event));
  expect(screen.getByText("Online")).toBeVisible();
  act(() =>
    mocks.options?.onEvent({ ...event, eventId: peer, status: "offline" }),
  );
  expect(screen.queryByText("Online")).toBeNull();
  act(() =>
    mocks.options?.onEvent({
      ...event,
      eventId: id,
      occurredAt: new Date(Date.now() + 1).toISOString(),
    }),
  );
  expect(screen.getByText("Online")).toBeVisible();
  act(() => mocks.options?.onStateChange?.("reconnecting"));
  expect(screen.queryByText("Online")).toBeNull();
  act(() =>
    mocks.options?.onEvent({
      ...event,
      occurredAt: new Date(Date.now() - 60000).toISOString(),
    }),
  );
  expect(screen.queryByText("Online")).toBeNull();
});
afterEach(() => {
  vi.useRealTimers();
  mocks.status = "authenticated";
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  mocks.dispose.mockReset();
  mocks.send.mockReset();
  mocks.account = { id: self, kind: "human" };
});
it("does not poll the human inbox while realtime is ready", async () => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.test");
  const fetcher = vi.fn().mockResolvedValue(Response.json({items: [], nextCursor: null}));
  vi.stubGlobal("fetch", fetcher);
  render(<MessagesWorkspace items={[]} labels={labels} locale="en" />);
  await act(async () => { await Promise.resolve(); });
  expect(fetcher).toHaveBeenCalled();
  act(() => mocks.options?.onStateChange?.("ready"));
  const calls = fetcher.mock.calls.length;

  await act(async () => vi.advanceTimersByTimeAsync(60_000));

  expect(fetcher).toHaveBeenCalledTimes(calls);
});
it("subscribes selected AI separately and refreshes authoritative history on its generation event", async () => {
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.test");
  mocks.send.mockReturnValue(true);
  const history = {
    conversation: {
      id,
      ipProfile: { id: peer, displayName: "AI Alice", username: "ai_alice" },
      lastMessage: null,
      updatedAt: conversation.updatedAt,
      sendEnabled: true,
    },
    items: [],
    nextCursor: null,
  };
  const fetcher = vi
    .fn()
    .mockImplementation((url: string) =>
      Promise.resolve(
        Response.json(
          url.startsWith("/api/conversations/")
            ? history
            : { items: [], nextCursor: null },
        ),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  render(
    <MessagesWorkspace
      items={[]}
      labels={labels}
      locale="en"
      selectedId={id}
      history={history}
      snapshotViewerId={self}
    />,
  );
  await screen.findByRole("heading", { name: "AI Alice" });
  await act(async () => mocks.options?.onAuthenticated({ reconnected: true }));
  expect(mocks.send).toHaveBeenCalledWith({
    v: 1,
    type: "subscribe_ai",
    conversationId: id,
  });
  const before = fetcher.mock.calls.filter((call) =>
    call[0].startsWith("/api/conversations/"),
  ).length;
  await act(async () =>
    mocks.options?.onAiEvent?.({
      v: 1,
      type: "ai_generation",
      eventId: self,
      conversationId: id,
      messageId: peer,
      state: "partial",
      occurredAt: new Date().toISOString(),
    }),
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter((call) =>
        call[0].startsWith("/api/conversations/"),
      ).length,
    ).toBeGreaterThan(before),
  );
});
it("never relabels an old server AI snapshot during an account change or unresolved identity", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ items: [], nextCursor: null })),
      ),
  );
  const items = [
    {
      id,
      ipProfile: {
        id: peer,
        displayName: "Private AI",
        username: "private_ai",
      },
      lastMessage: {
        role: "assistant" as const,
        body: "Private A message",
        createdAt: conversation.createdAt,
      },
      updatedAt: conversation.updatedAt,
      sendEnabled: true,
    },
  ];
  const view = render(
    <MessagesWorkspace
      items={items}
      labels={labels}
      locale="en"
      snapshotViewerId={self}
    />,
  );
  expect(screen.getByText("Private A message")).toBeVisible();
  mocks.status = "loading";
  view.rerender(
    <MessagesWorkspace
      items={items}
      labels={labels}
      locale="en"
      snapshotViewerId={self}
    />,
  );
  expect(screen.queryByText("Private A message")).toBeNull();
  mocks.account = { id: peer, kind: "human" };
  mocks.status = "authenticated";
  view.rerender(
    <MessagesWorkspace
      items={items}
      labels={labels}
      locale="en"
      snapshotViewerId={self}
    />,
  );
  expect(screen.queryByText("Private A message")).toBeNull();
});
it("loads human inbox on the normal Messages route and resubscribes/refetches on realtime authentication", async () => {
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.test");
  const fetcher = vi.fn().mockImplementation(() =>
    Promise.resolve(
      Response.json({
        items: [
          {
            conversation,
            latestMessage: null,
            unreadCount: 0,
            lastReadSequence: 0,
          },
        ],
        nextCursor: null,
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<MessagesWorkspace items={[]} labels={labels} locale="en" />);
  expect(await screen.findByRole("link", { name: /Alice/ })).toHaveAttribute(
    "href",
    `/en/messages?humanConversation=${id}`,
  );
  await act(async () => mocks.options?.onAuthenticated({ reconnected: true }));
  await waitFor(() =>
    expect(mocks.send).toHaveBeenCalledWith({
      v: 1,
      type: "subscribe",
      conversationId: id,
    }),
  );
  expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
});
it("applies a realtime message without refetching the inbox", async () => {
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.test");
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      items: [{ conversation, latestMessage: null, unreadCount: 0, lastReadSequence: 0 }],
      nextCursor: null,
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<MessagesWorkspace items={[]} labels={labels} locale="en" />);
  await screen.findByRole("link", { name: /Alice/ });
  const calls = fetcher.mock.calls.length;
  act(() =>
    mocks.options?.onEvent({
      v: 1,
      type: "message",
      eventId: "44444444-4444-4444-8444-444444444444",
      conversationId: id,
      occurredAt: "2026-09-02T00:00:00.000Z",
      message: {
        v: 1,
        id: "55555555-5555-4555-8555-555555555555",
        conversationId: id,
        senderProfileId: peer,
        clientRequestId: "66666666-6666-4666-8666-666666666666",
        sequence: 1,
        createdAt: "2026-09-02T00:00:00.000Z",
        content: { kind: "text", text: "Realtime message" },
      },
    }),
  );
  expect(fetcher).toHaveBeenCalledTimes(calls);
  expect(screen.getByText("Realtime message")).toBeVisible();
});
it("adds a realtime message to the open conversation without a history reload", async () => {
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.test");
  const fetcher = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(
      Response.json(
        url.includes("/messages?")
          ? { items: [] }
          : {
              items: [{ conversation, latestMessage: null, unreadCount: 0, lastReadSequence: 0 }],
              nextCursor: null,
            },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<MessagesWorkspace items={[]} labels={labels} locale="en" selectedHumanId={id} />);
  await screen.findByText("No messages yet");
  const calls = fetcher.mock.calls.length;
  act(() =>
    mocks.options?.onEvent({
      v: 1,
      type: "message",
      eventId: "44444444-4444-4444-8444-444444444444",
      conversationId: id,
      occurredAt: "2026-09-02T00:00:00.000Z",
      message: {
        v: 1,
        id: "55555555-5555-4555-8555-555555555555",
        conversationId: id,
        senderProfileId: peer,
        clientRequestId: "66666666-6666-4666-8666-666666666666",
        sequence: 1,
        createdAt: "2026-09-02T00:00:00.000Z",
        content: { kind: "text", text: "Live detail message" },
      },
    }),
  );
  expect(fetcher).toHaveBeenCalledTimes(calls);
  expect(screen.getAllByText("Live detail message")).toHaveLength(2);
});
it("disposes the previous account connection and requests immediately on identity change", async () => {
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.test");
  const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal("fetch", fetcher);
  const view = render(
    <MessagesWorkspace items={[]} labels={labels} locale="en" />,
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  const oldSignal = (fetcher.mock.calls[0]![1] as RequestInit).signal;
  mocks.account = { id: peer, kind: "human" };
  view.rerender(<MessagesWorkspace items={[]} labels={labels} locale="en" />);
  expect(oldSignal?.aborted).toBe(true);
  expect(mocks.dispose).toHaveBeenCalled();
});
it("shows the existing helpful empty state after an empty HUMAN inbox finishes loading", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ items: [], nextCursor: null })),
      ),
  );
  render(<MessagesWorkspace items={[]} labels={labels} locale="en" />);
  expect(
    await screen.findByRole("heading", { name: "No conversations" }),
  ).toBeVisible();
});
it("keeps loaded older HUMAN conversations authoritative after reconnect", async () => {
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.test");
  const cursor = encodeHumanInboxCursor({
    v: 1,
    updatedAt: conversation.updatedAt,
    id,
  });
  const older = {
    ...conversation,
    id: "66666666-6666-4666-8666-666666666666",
    participants: [
      conversation.participants[0],
      { ...conversation.participants[1], displayName: "Older Alice" },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json({
        items: [
          {
            conversation: url.includes("cursor=") ? older : conversation,
            latestMessage: null,
            unreadCount: 0,
            lastReadSequence: 0,
          },
        ],
        nextCursor: url.includes("cursor=") ? null : cursor,
      }),
    ),
  );
  render(<MessagesWorkspace items={[]} labels={labels} locale="en" />);
  await screen.findByRole("link", { name: /Alice/ });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("link", { name: /Older Alice/ });
  await act(async () => mocks.options?.onAuthenticated({ reconnected: true }));
  await waitFor(() => expect(screen.queryByText("Loading")).toBeNull());
  expect(screen.getByRole("link", { name: /Older Alice/ })).toBeVisible();
});
