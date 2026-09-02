import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "./error.js";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/zh-CN/posts/example" }));

describe("localized route error boundary", () => {
  it("uses the Next reset contract without exposing an error stack", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("private failure details")} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute(
      "href",
      "/zh-CN",
    );
    expect(screen.queryByText("private failure details")).not.toBeInTheDocument();
    expect(screen.queryByText(/Error:/)).not.toBeInTheDocument();
  });
});
