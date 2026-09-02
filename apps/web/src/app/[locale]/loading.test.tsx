import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Loading from "./loading.js";

vi.mock('next/navigation', () => ({usePathname: () => '/zh-CN'}))

describe("localized loading boundary", () => {
  it("uses the feed route skeleton", () => {
    render(<Loading />);

    expect(screen.getByRole("status", { name: "正在加载 AIFANS" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
