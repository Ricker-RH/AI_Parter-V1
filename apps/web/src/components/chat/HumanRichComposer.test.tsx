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
it("does not expose sharing in the mobile attachment panel", () => {
  render(<HumanRichComposer {...props} panel="more" />);

  expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
});
