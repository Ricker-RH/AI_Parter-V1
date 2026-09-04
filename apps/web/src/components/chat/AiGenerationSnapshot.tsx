import type { ChatMessage } from "@aifans/contracts";
import type { Locale } from "../../i18n/config";
import styles from "./MessagesWorkspace.module.css";
export function AiGenerationSnapshot({
  message,
  locale,
}: {
  message: ChatMessage;
  locale: Locale;
}) {
  const generation = message.generation;
  if (
    message.role !== "human" ||
    !generation ||
    generation.state === "completed"
  )
    return null;
  const zh = locale === "zh-CN";
  const status =
    generation.state === "failed"
      ? zh
        ? "生成失败；已保存的部分回复保留如下。"
        : "Generation failed. Any saved partial answer is retained."
      : generation.state === "partial"
        ? zh
          ? "已保存部分回复，正在核对生成状态。"
          : "Saved partial answer; checking generation status."
        : zh
          ? "已记录生成请求，正在核对状态。"
          : "Generation request saved; checking status.";
  return (
    <li className={styles.assistantMessage}>
      {generation.answer ? <p>{generation.answer}</p> : null}
      <span className={styles.preview} role="status">
        {status}
      </span>
    </li>
  );
}
