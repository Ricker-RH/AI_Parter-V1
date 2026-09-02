import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingScreen } from "./LoadingScreen.js";

describe("LoadingScreen", () => {
  it("renders the official mark as a full-screen neutral loading status", () => {
    render(<LoadingScreen />);

    expect(screen.getByRole("status", { name: "Loading AIFANS" })).toHaveClass(
      "loading-screen",
    );
    expect(screen.getByRole("img", {name: "AIFANS"})).toHaveClass("loading-screen-mark");
    expect(screen.getByRole("status").childElementCount).toBe(1);
  });
});
