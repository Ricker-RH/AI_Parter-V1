import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading.js";

describe("root loading boundary", () => {
  it("uses the full-screen loading screen", () => {
    render(<Loading />);

    expect(screen.getByRole("status", { name: "Loading AIFANS" })).toBeVisible();
  });
});
