import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  encodeChatConversationCursor,
  encodeChatMessageCursor,
} from "@aifans/contracts";
import { ConversationDetail } from "./ConversationDetail.js";
import { MessagesSectionHeader } from "./MessagesSectionHeader.js";

const composerRenders = vi.hoisted(
  () => [] as { conversationId: string; bodies: string[] }[],
);
vi.mock("./ChatComposer.js", () => ({
  ChatComposer: ({
    conversationId,
    messages,
  }: {
    conversationId: string;
    messages: { body: string }[];
  }) => {
    composerRenders.push({
      conversationId,
      bodies: messages.map((message) => message.body),
    });
    return null;
  },
}));

const labels = {
  back: "Back",
  emptyHistory: "No messages yet",
  loadEarlierMessages: "Load earlier messages",
  messagePlaceholder: "Write a message…",
  send: "Send",
  sending: "Sending…",
  messageFailed: "Message failed",
  retry: "Retry",
  providerUnavailable: "Provider unavailable",
  invalidResponse: "Invalid response",
  unavailable: "Unavailable",
};
const first = {
  conversation: {
    id: "11111111-1111-4111-8111-111111111111",
    ipProfile: {
      id: "22222222-2222-4222-8222-222222222222",
      displayName: "Luma",
      username: "luma",
    },
    lastMessage: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    sendEnabled: true,
  },
  items: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      role: "assistant" as const,
      body: "First history",
      deliveryState: "sent" as const,
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  nextCursor: null,
};
const second = {
  conversation: {
    ...first.conversation,
    id: "44444444-4444-4444-8444-444444444444",
    ipProfile: {
      ...first.conversation.ipProfile,
      displayName: "Nova",
      username: "nova",
    },
  },
  items: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      role: "assistant" as const,
      body: "Second history",
      deliveryState: "sent" as const,
      createdAt: "2026-09-01T00:01:00.000Z",
    },
  ],
  nextCursor: null,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  composerRenders.length = 0;
});

describe("ConversationDetail", () => {
  it("uses visible fallback polling only without realtime and updates saved generation state", async () => {
    vi.useFakeTimers();
    const human = {
      ...first.items[0]!,
      role: "human" as const,
      body: "Question",
      generation: { state: "partial" as const, answer: "Saved" },
    };
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({
            ...first,
            items: [
              { ...human, generation: { state: "failed", answer: "Saved" } },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const view = render(
      <ConversationDetail
        history={{ ...first, items: [human] }}
        labels={labels}
        locale="en"
        realtimeReady
      />,
    );
    await act(async () => vi.advanceTimersByTime(15000));
    expect(fetcher).not.toHaveBeenCalled();
    view.rerender(
      <ConversationDetail
        history={{ ...first, items: [human] }}
        labels={labels}
        locale="en"
        realtimeReady={false}
      />,
    );
    await act(async () => vi.advanceTimersByTime(15000));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(
      screen.getByText(
        "Generation failed. Any saved partial answer is retained.",
      ),
    ).toBeVisible();
  });
  it("aborts an authoritative revision refresh on unmount", async () => {
    const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const view = render(
      <ConversationDetail
        history={first}
        labels={labels}
        locale="en"
        revision={0}
      />,
    );
    view.rerender(
      <ConversationDetail
        history={first}
        labels={labels}
        locale="en"
        revision={1}
      />,
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    view.unmount();
    expect(fetcher.mock.calls[0]?.[1].signal.aborted).toBe(true);
  });
  it("restores partial answers and replaces the snapshot with the canonical completed assistant", async () => {
    const human = {
      ...first.items[0]!,
      role: "human" as const,
      body: "Question",
      generation: { state: "partial" as const, answer: "Saved partial answer" },
    };
    const view = render(
      <ConversationDetail
        history={{ ...first, items: [human] }}
        labels={labels}
        locale="en"
      />,
    );
    expect(screen.getByText("Saved partial answer")).toBeVisible();
    view.rerender(
      <ConversationDetail
        history={{
          ...first,
          items: [
            {
              ...human,
              generation: { state: "completed", answer: "Final answer" },
            },
            { ...second.items[0]!, body: "Final answer" },
          ],
        }}
        labels={labels}
        locale="en"
      />,
    );
    await waitFor(() =>
      expect(screen.queryByText("Saved partial answer")).toBeNull(),
    );
    expect(screen.getAllByText("Final answer")).toHaveLength(1);
  });
  it("reconciles local transcript state when route history changes", async () => {
    const { rerender } = render(
      <ConversationDetail history={first} labels={labels} locale="en" />,
    );
    expect(screen.getByText("First history")).toBeVisible();
    rerender(
      <ConversationDetail history={second} labels={labels} locale="en" />,
    );
    expect(await screen.findByText("Second history")).toBeVisible();
    expect(screen.queryByText("First history")).toBeNull();
  });

  it("preserves the originating list cursor and exposes the mobile Messages section header", () => {
    render(
      <ConversationDetail
        history={first}
        labels={labels}
        listCursor="origin-page"
        locale="en"
        sectionHeader={
          <MessagesSectionHeader
            active="chat"
            labels={{
              title: "Messages",
              chatTab: "Chats",
              notificationsTab: "Notifications",
            }}
            locale="en"
          />
        }
      />,
    );
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/en/messages?cursor=origin-page",
    );
    expect(screen.getByRole("heading", { name: "Messages" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Notifications" })).toHaveAttribute(
      "href",
      "/en/messages/notifications",
    );
  });

  it("never renders the previous transcript under a newly selected conversation identity", () => {
    const { rerender } = render(
      <ConversationDetail history={first} labels={labels} locale="en" />,
    );
    composerRenders.length = 0;
    rerender(
      <ConversationDetail history={second} labels={labels} locale="en" />,
    );
    expect(composerRenders).not.toContainEqual({
      conversationId: second.conversation.id,
      bodies: ["First history"],
    });
    expect(composerRenders).toContainEqual({
      conversationId: second.conversation.id,
      bodies: ["Second history"],
    });
  });

  it("shows a localized visible failed marker for a failed human message", () => {
    const history = {
      ...first,
      items: [
        {
          ...first.items[0]!,
          role: "human" as const,
          deliveryState: "failed" as const,
        },
      ],
    };
    render(
      <ConversationDetail history={history} labels={labels} locale="en" />,
    );
    expect(screen.getByText("Message failed")).toBeVisible();
  });

  it("loads, prepends, and de-duplicates older history without replacing newer messages", async () => {
    const newer = {
      ...first,
      items: [
        {
          ...first.items[0]!,
          id: "33333333-3333-4333-8333-333333333333",
          body: "Newer",
          createdAt: "2026-09-01T00:02:00.000Z",
        },
      ],
    };
    const older = {
      ...newer,
      items: [
        {
          ...first.items[0]!,
          id: "44444444-4444-4444-8444-444444444444",
          body: "Older",
          createdAt: "2026-09-01T00:01:00.000Z",
        },
        newer.items[0]!,
        newer.items[0]!,
      ],
      nextCursor: "older-again",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(older)));
    render(
      <ConversationDetail
        history={{ ...newer, nextCursor: "older-page" }}
        labels={labels}
        locale="en"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Load earlier messages" }),
    );
    expect(await screen.findByText("Older")).toBeVisible();
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(["Older", "Newer"]);
    expect(fetch).toHaveBeenCalledWith(
      `/api/conversations/${first.conversation.id}/messages?cursor=older-page`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(
      screen.getByRole("button", { name: "Load earlier messages" }),
    ).toBeEnabled();
  });

  it("prevents a second earlier-history request while the first is active", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((done) => {
          resolve = done;
        }),
      ),
    );
    render(
      <ConversationDetail
        history={{ ...first, nextCursor: "older-page" }}
        labels={labels}
        locale="en"
      />,
    );
    const more = screen.getByRole("button", { name: "Load earlier messages" });
    fireEvent.click(more);
    fireEvent.click(more);
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(Response.json({ ...first, items: [], nextCursor: null }));
    await waitFor(() => expect(more).toBeDisabled());
  });

  it("keeps the transcript and reports an unavailable earlier-history page honestly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    render(
      <ConversationDetail
        history={{ ...first, nextCursor: "older-page" }}
        labels={labels}
        locale="en"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Load earlier messages" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Unavailable");
    expect(screen.getByText("First history")).toBeVisible();
  });

  it("redirects an expired earlier-history read to full-page sign-in", async () => {
    const assign = vi.fn();
    const listCursor = encodeChatConversationCursor({
      v: 1,
      kind: "chat-conversations",
      updatedAt: "2026-09-01T00:00:00.000Z",
      id: first.conversation.id,
    });
    const historyCursor = encodeChatMessageCursor({
      v: 1,
      kind: "chat-messages",
      createdAt: "2026-08-31T00:00:00.000Z",
      id: first.items[0]!.id,
    });
    vi.stubGlobal("location", { assign });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    render(
      <ConversationDetail
        history={{ ...first, nextCursor: historyCursor }}
        labels={labels}
        listCursor={listCursor}
        locale="en"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Load earlier messages" }),
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        `/en/auth/sign-in?next=${encodeURIComponent(`/en/messages/${first.conversation.id}?listCursor=${listCursor}&cursor=${historyCursor}`)}`,
      ),
    );
  });

  it("does not merge a late older-history response into a newly selected conversation", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((done) => {
          resolve = done;
        }),
      ),
    );
    const oldPage = {
      ...first,
      items: [{ ...first.items[0]!, body: "Stale older history" }],
      nextCursor: null,
    };
    const { rerender } = render(
      <ConversationDetail
        history={{ ...first, nextCursor: "older-page" }}
        labels={labels}
        locale="en"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Load earlier messages" }),
    );
    const init = (fetch as ReturnType<typeof vi.fn>).mock
      .calls[0]![1] as RequestInit;
    rerender(
      <ConversationDetail history={second} labels={labels} locale="en" />,
    );
    expect((init.signal as AbortSignal).aborted).toBe(true);
    resolve(Response.json(oldPage));
    await waitFor(() =>
      expect(screen.getByText("Second history")).toBeVisible(),
    );
    expect(screen.queryByText("Stale older history")).toBeNull();
  });

  it("aborts an earlier-history request when the detail unmounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise<Response>(() => {})),
    );
    const { unmount } = render(
      <ConversationDetail
        history={{ ...first, nextCursor: "older-page" }}
        labels={labels}
        locale="en"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Load earlier messages" }),
    );
    const init = (fetch as ReturnType<typeof vi.fn>).mock
      .calls[0]![1] as RequestInit;
    unmount();
    expect((init.signal as AbortSignal).aborted).toBe(true);
  });

  it("restores its mounted guard after Strict Effects setup-cleanup-setup", async () => {
    const older = {
      ...first,
      items: [
        {
          ...first.items[0]!,
          id: "77777777-7777-4777-8777-777777777777",
          body: "Older after strict setup",
          createdAt: "2026-08-31T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(older)));
    render(
      <StrictMode>
        <ConversationDetail
          history={{ ...first, nextCursor: "older-page" }}
          labels={labels}
          locale="en"
        />
      </StrictMode>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Load earlier messages" }),
    );
    expect(await screen.findByText("Older after strict setup")).toBeVisible();
  });

  it.each([401, 503])(
    "cancels a %i earlier-history response body before leaving the active request",
    async (status) => {
      const cancel = vi.fn().mockResolvedValue(undefined);
      if (status === 401) vi.stubGlobal("location", { assign: vi.fn() });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          status,
          ok: false,
          headers: new Headers(),
          body: { cancel },
        }),
      );
      render(
        <ConversationDetail
          history={{ ...first, nextCursor: "older-page" }}
          labels={labels}
          locale="en"
        />,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Load earlier messages" }),
      );
      await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    },
  );
});
