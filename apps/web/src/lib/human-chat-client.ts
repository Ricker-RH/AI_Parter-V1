import { HumanMessageSchema, type HumanMessage } from "@aifans/contracts";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function realtimeEndpoint(
  origin: string | undefined,
  profileId: string,
): string | null {
  if (!origin || !uuid.test(profileId)) return null;
  try {
    const url = new URL(origin);
    if (
      url.protocol !== "wss:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return `${url.origin}/connect/${profileId}`;
  } catch {
    return null;
  }
}
export async function humanRequest(
  path: string,
  signal: AbortSignal,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(`/api/human-chat/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    const value = (await response.json().catch(() => null)) as {
      code?: string;
    } | null;
    throw Error(
      response.status === 401
        ? "UNAUTHORIZED"
        : (value?.code ?? "HUMAN_CHAT_UNAVAILABLE"),
    );
  }
  return response.json();
}
export function humanHistory(
  value: unknown,
  conversationId: string,
): HumanMessage[] {
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).length !== 1 ||
    !("items" in value) ||
    !Array.isArray(value.items) ||
    value.items.length > 100
  )
    throw Error("HUMAN_CHAT_INVALID_RESPONSE");
  const items = value.items.map((item) => HumanMessageSchema.parse(item));
  if (
    items.some(
      (item, index) =>
        item.conversationId !== conversationId ||
        (index > 0 && item.sequence <= items[index - 1]!.sequence),
    )
  )
    throw Error("HUMAN_CHAT_INVALID_RESPONSE");
  return items;
}
export function mergeHumanMessages(
  current: HumanMessage[],
  incoming: HumanMessage[],
): HumanMessage[] {
  return [
    ...new Map(
      [...current, ...incoming].map((message) => [message.id, message]),
    ).values(),
  ].sort((a, b) => a.sequence - b.sequence);
}
