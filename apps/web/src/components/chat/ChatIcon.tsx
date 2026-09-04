import type { CSSProperties } from "react";

export function ChatIcon({
  name,
}: {
  name:
    | "voice"
    | "keyboard"
    | "emoji"
    | "plus"
    | "send"
    | "image"
    | "camera"
    | "share"
    | "sticker";
}) {
  const paths = {
    voice: (
      <>
        <rect x="9" y="2" width="6" height="13" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
      </>
    ),
    keyboard: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M6 9h1m3 0h1m3 0h1m3 0h1M6 12h1m3 0h1m3 0h1m3 0h1M7 16h10" />
      </>
    ),
    emoji: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 9h.01M16 9h.01M8 14q4 5 8 0" />
      </>
    ),
    plus: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M7 12h10M12 7v10" />
      </>
    ),
    send: (
      <>
        <path d="m5 12 7-7 7 7M12 5v15" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8" cy="8" r="1" />
        <path d="m3 17 6-6 4 4 3-3 5 5" />
      </>
    ),
    camera: (
      <>
        <path d="M8 5 9 3h6l1 2h4v15H4V5Z" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    share: (
      <>
        <path d="M14 4h6v6M20 4l-9 9M10 5H4v15h15v-6" />
      </>
    ),
    sticker: (
      <>
        <path d="M4 4h16v10l-6 6H4ZM14 20v-6h6M8 9h.01M14 9h.01M8 13q3 3 6 0" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 } as CSSProperties}
    >
      {paths[name]}
    </svg>
  );
}
