import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HumanRichComposer } from "./HumanRichComposer";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("aborts an in-flight send on unmount and never publishes its late result", async () => {
  const sent = vi.fn(),
    fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HumanRichComposer {...props} onSent={sent} />);
  fireEvent.click(screen.getByRole("button", { name: "Stickers" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Wave" }));
  fireEvent.click(screen.getByRole("button", { name: "Send sticker" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  view.unmount();
  expect(fetcher.mock.calls[0]?.[1].signal.aborted).toBe(true);
  expect(sent).not.toHaveBeenCalled();
});
const id = "11111111-1111-4111-8111-111111111111";
const props = {
  peerId: id,
  conversationId: id,
  selfProfileId: id,
  locale: "en" as const,
  disabled: false,
  onSent: vi.fn(),
  onError: vi.fn(),
  onBusy: vi.fn(),
};
it("requires preview confirmation and preserves sticker request ID on retry", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ code: "TEMPORARY" }, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  render(<HumanRichComposer {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Stickers" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Wave/i }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Send sticker" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Send sticker" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Send sticker" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual(
    JSON.parse(fetcher.mock.calls[1]?.[1].body),
  );
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body).content).toEqual({
    kind: "sticker",
    stickerId: "wave",
  });
});
it("searches authoritative internal targets and sends only the selected identifier", async () => {
  const card = {
    target: { kind: "post", id },
    title: "Published post",
    subtitle: "A real author",
  };
  const fetcher = vi
    .fn()
    .mockImplementation((url: string, init: RequestInit) =>
      Promise.resolve(
        init.method === "POST"
          ? Response.json({ code: "TEMPORARY" }, { status: 503 })
          : Response.json({ items: [card] }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<HumanRichComposer {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Published" },
  });
  const result = await screen.findByRole("button", { name: /Published post/ });
  screen.getByRole("searchbox").focus();
  fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Tab" });
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(result).toHaveFocus();
  fireEvent.click(result);
  expect(screen.getByText("Published post")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Send share" }));
  await waitFor(() =>
    expect(fetcher.mock.calls.some((call) => call[1]?.method === "POST")).toBe(
      true,
    ),
  );
  const send = fetcher.mock.calls.find((call) => call[1]?.method === "POST");
  expect(JSON.parse(send?.[1].body).content).toEqual({
    kind: "share",
    target: card.target,
  });
});
