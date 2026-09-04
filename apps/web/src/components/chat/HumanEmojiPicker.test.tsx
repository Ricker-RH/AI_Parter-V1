import { useRef, useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { HumanEmojiPicker } from "./HumanEmojiPicker";
function Harness() {
  const textarea = useRef<HTMLTextAreaElement | null>(null),
    [draft, setDraft] = useState("hello");
  return (
    <>
      <textarea
        aria-label="Draft"
        ref={textarea}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <HumanEmojiPicker
        textarea={textarea}
        draft={draft}
        setDraft={setDraft}
        disabled={false}
        zh={false}
      />
    </>
  );
}
it("inserts at selection, restores editor focus, and dismisses with Escape", async () => {
  render(<Harness />);
  const editor = screen.getByLabelText("Draft") as HTMLTextAreaElement;
  editor.focus();
  editor.setSelectionRange(1, 4);
  fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "😀" }));
  expect(editor.value).toBe("h😀o");
  await waitFor(() => expect(editor).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.getByRole("button", { name: "Emoji" })).toHaveFocus();
});
