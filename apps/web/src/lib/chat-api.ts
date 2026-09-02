import {
  ApiErrorSchema,
  ChatConversationPageSchema,
  ChatHistoryPageSchema,
  type ChatConversationPage,
  type ChatHistoryPage,
} from "@aifans/contracts";
import { fetchAifansApi } from "./server-api";

export type ChatApiResult<T> =
  | { status: "ok"; data: T }
  | { status: "auth-required" }
  | { status: "not-found" }
  | { status: "unavailable" };
type Schema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

async function request<T>(
  path: string,
  schema: Schema<T>,
  token?: string,
): Promise<ChatApiResult<T>> {
  try {
    const response = await fetchAifansApi(
      path,
      token ? { getToken: async () => token } : undefined,
    );
    if (response.status === 401) return { status: "auth-required" };
    const body: unknown = await response.json();
    if (response.ok) {
      const parsed = schema.safeParse(body);
      return parsed.success
        ? { status: "ok", data: parsed.data }
        : { status: "unavailable" };
    }
    const error = ApiErrorSchema.safeParse(body);
    return response.status === 404 &&
      error.success &&
      (error.data.code === "CHAT_CONVERSATION_NOT_FOUND" ||
        error.data.code === "CHAT_TARGET_NOT_FOUND")
      ? { status: "not-found" }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
export function fetchConversations({
  cursor,
  token,
}: { cursor?: string; token?: string } = {}) {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  return request<ChatConversationPage>(
    `/v1/chat/conversations${query.size ? `?${query}` : ""}`,
    ChatConversationPageSchema,
    token,
  );
}
export function fetchConversationHistory(
  conversationId: string,
  { cursor, token }: { cursor?: string; token?: string } = {},
) {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  return request<ChatHistoryPage>(
    `/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages${query.size ? `?${query}` : ""}`,
    ChatHistoryPageSchema,
    token,
  );
}
