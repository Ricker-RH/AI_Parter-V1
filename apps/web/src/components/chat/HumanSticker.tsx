import { HUMAN_CHAT_STICKERS } from "@aifans/contracts";
import type { Locale } from "../../i18n/config";
import styles from "./MessagesWorkspace.module.css";
export function HumanSticker({
  stickerId,
  locale,
}: {
  stickerId: string;
  locale: Locale;
}) {
  const sticker = HUMAN_CHAT_STICKERS.find((item) => item.id === stickerId);
  return sticker ? (
    <span
      className={styles.sticker}
      role="img"
      aria-label={sticker.label[locale]}
    >
      {sticker.glyph}
    </span>
  ) : (
    <p>{locale === "zh-CN" ? "贴纸已不可用" : "Sticker unavailable"}</p>
  );
}
