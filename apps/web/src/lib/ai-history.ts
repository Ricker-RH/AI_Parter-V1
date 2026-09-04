import type { ChatMessage } from "@aifans/contracts";
export function mergeAiHistory(
  current: ChatMessage[],
  incoming: ChatMessage[],
) {
  const humanKeys = new Set(
    incoming
      .filter((x) => x.role === "human")
      .map((x) => x.clientRequestId)
      .filter(Boolean),
  );
  const replyKeys = new Set(
    incoming
      .filter((x) => x.role === "assistant")
      .map((x) => x.inReplyToClientRequestId)
      .filter(Boolean),
  );
  const retained = current.filter(
    (message) =>
      !(
        message.role === "human" &&
        message.clientRequestId &&
        humanKeys.has(message.clientRequestId)
      ) &&
      !(
        message.role === "assistant" &&
        [...replyKeys].some((key) => message.id === `${key}-assistant`)
      ),
  );
  return [
    ...new Map(
      [...retained, ...incoming].map((message) => [message.id, message]),
    ).values(),
  ].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
