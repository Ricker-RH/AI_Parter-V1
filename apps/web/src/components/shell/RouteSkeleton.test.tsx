import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteSkeleton } from "./RouteSkeleton.js";

describe("RouteSkeleton", () => {
  it.each([
    ["feed", 3], ["list", 5], ["detail", 1], ["search", 4],
    ["profile", 3], ["messages", 5], ["message-detail", 3],
    ["auth", 3], ["settings", 3], ["creator-center", 3], ["creator-draft", 5],
  ] as const)("renders a stable %s skeleton structure", (variant, cardCount) => {
    const { container } = render(<RouteSkeleton label="正在加载 AIFANS" variant={variant} />);

    expect(
      screen.getByRole("status", { name: "正在加载 AIFANS" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(`.route-skeleton--${variant}`)).toBeTruthy();
    expect(container.querySelectorAll(".route-skeleton-card")).toHaveLength(
      cardCount,
    );
    expect(container.querySelectorAll(".route-skeleton-line").length).toBeGreaterThan(
      cardCount,
    );
  });

  it.each(["search", "profile", "messages", "auth", "settings"] as const)(
    "gives the %s route a content-shaped frame",
    (variant) => {
      const {container} = render(<RouteSkeleton label="Loading AIFANS" variant={variant} />)
      expect(container.querySelector(`[data-skeleton-shape="${variant}"]`)).toBeTruthy()
    },
  )

  it.each(['message-detail', 'creator-center', 'creator-draft'] as const)(
    'exposes route-specific %s landmarks',
    (variant) => {
      const {container} = render(<RouteSkeleton label="Loading AIFANS" variant={variant}/>)
      expect(container.querySelector(`[data-skeleton-shape="${variant}"]`)).toBeTruthy()
      expect(container.querySelector(`.route-skeleton-${variant}-frame`)).toBeTruthy()
    },
  )
});
