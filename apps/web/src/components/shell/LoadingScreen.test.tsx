import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingScreen } from "./LoadingScreen.js";

describe("LoadingScreen", () => {
  it("renders only the AIFANS wordmark with an accessible loading status", () => {
    render(<LoadingScreen />);

    expect(screen.getByRole("status", { name: "Loading AIFANS" })).toHaveClass(
      "loading-screen",
    );
    expect(screen.getByText("AIFANS")).toHaveClass(
      "loading-screen-wordmark",
    );
    expect(screen.getByRole("status").childElementCount).toBe(1);
  });
});
