import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { HumanSticker } from "./HumanSticker";
it("renders a bundled sticker accessibly and leaves unknown IDs unavailable", () => {
  const view = render(<HumanSticker stickerId="wave" locale="en" />);
  expect(screen.getByRole("img", { name: "Wave" })).toHaveTextContent("👋");
  view.rerender(
    <HumanSticker stickerId="https://untrusted.test/art.svg" locale="en" />,
  );
  expect(screen.getByText("Sticker unavailable")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
});
