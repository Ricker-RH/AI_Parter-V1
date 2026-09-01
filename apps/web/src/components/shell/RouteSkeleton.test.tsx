import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteSkeleton } from "./RouteSkeleton.js";

describe("RouteSkeleton", () => {
  it.each([
    ["feed", 3],
    ["list", 5],
    ["detail", 1],
  ] as const)("renders a stable %s skeleton structure", (variant, cardCount) => {
    const { container } = render(<RouteSkeleton variant={variant} />);

    expect(
      screen.getByRole("status", { name: `Loading ${variant}` }),
    ).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(`.route-skeleton--${variant}`)).toBeTruthy();
    expect(container.querySelectorAll(".route-skeleton-card")).toHaveLength(
      cardCount,
    );
    expect(container.querySelectorAll(".route-skeleton-line").length).toBeGreaterThan(
      cardCount,
    );
  });
});
