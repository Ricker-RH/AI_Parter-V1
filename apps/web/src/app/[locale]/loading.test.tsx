import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading.js";

describe("localized loading boundary", () => {
  it("uses the feed route skeleton", () => {
    render(<Loading />);

    expect(screen.getByRole("status", { name: "AIFANS" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
