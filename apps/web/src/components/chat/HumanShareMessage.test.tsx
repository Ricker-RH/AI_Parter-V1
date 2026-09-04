import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HumanShareMessage } from "./HumanShareMessage";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("does not render a resolved card for a different target", async () => {
  const error = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          state: "available",
          card: {
            target: { kind: "ip", id },
            title: "Wrong target",
            subtitle: "",
          },
        }),
      ),
  );
  render(
    <HumanShareMessage
      target={{ kind: "human", id }}
      locale="en"
      revision={0}
      onError={error}
    />,
  );
  await screen.findByRole("button", { name: "Reload shared content" });
  expect(screen.queryByRole("link")).toBeNull();
  expect(error).toHaveBeenCalled();
});
const id = "11111111-1111-4111-8111-111111111111";
it("renders only resolved internal routes and removes a card after visibility changes", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          state: "available",
          card: {
            target: { kind: "human", id },
            title: "Alice",
            subtitle: "@alice",
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ state: "unavailable" })),
  );
  const view = render(
    <HumanShareMessage
      target={{ kind: "human", id }}
      locale="en"
      revision={0}
      onError={() => {}}
    />,
  );
  expect(await screen.findByRole("link", { name: /Alice/ })).toHaveAttribute(
    "href",
    `/en/humans/${id}`,
  );
  view.rerender(
    <HumanShareMessage
      target={{ kind: "human", id }}
      locale="en"
      revision={1}
      onError={() => {}}
    />,
  );
  expect(await screen.findByText("Shared content unavailable")).toBeTruthy();
  expect(screen.queryByRole("link")).toBeNull();
});
