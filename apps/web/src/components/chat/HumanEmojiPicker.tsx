"use client";
import { useRef, useState, type RefObject } from "react";
import { ProfileEditorMenu } from "../profile/ProfileEditorMenu";
import styles from "./MessagesWorkspace.module.css";
export function HumanEmojiPicker({
  draft,
  setDraft,
  textarea,
  disabled,
  zh,
}: {
  draft: string;
  setDraft: (value: string) => void;
  textarea: RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  zh: boolean;
}) {
  const anchor = useRef<HTMLButtonElement | null>(null),
    selection = useRef([0, 0]);
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.emojiTools}>
      <button
        ref={anchor}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          selection.current = [
            textarea.current?.selectionStart ?? draft.length,
            textarea.current?.selectionEnd ?? draft.length,
          ];
          setOpen(!open);
        }}
      >
        {zh ? "表情" : "Emoji"}
      </button>
      {open ? (
        <ProfileEditorMenu
          anchor={anchor}
          id="human-emoji-menu"
          label={zh ? "选择表情" : "Choose emoji"}
          onClose={() => setOpen(false)}
        >
          {["😀", "😂", "🥰", "👍", "❤️", "🎉", "🙏", "😊"].map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              onClick={() => {
                const start = selection.current[0] ?? draft.length,
                  end = selection.current[1] ?? start;
                const next = draft.slice(0, start) + emoji + draft.slice(end);
                if (next.length <= 4000) setDraft(next);
                setOpen(false);
                requestAnimationFrame(() => {
                  textarea.current?.focus();
                  textarea.current?.setSelectionRange(
                    start + emoji.length,
                    start + emoji.length,
                  );
                });
              }}
            >
              {emoji}
            </button>
          ))}
        </ProfileEditorMenu>
      ) : null}
    </div>
  );
}
