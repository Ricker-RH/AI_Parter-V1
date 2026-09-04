import { expect, it } from "vitest";
import { mergeAiHistory } from "./ai-history";
import type { ChatMessage } from "@aifans/contracts";
it("replaces unacknowledged optimistic messages and temporary answers by exact request correlation", () => {
  const request = "11111111-1111-4111-8111-111111111111";
  const optimistic: ChatMessage = {
    id: request,
    clientRequestId: request,
    role: "human",
    body: "Question",
    createdAt: "2026-09-01T00:00:00Z",
    deliveryState: "failed",
  };
  const human = {
    ...optimistic,
    id: "22222222-2222-4222-8222-222222222222",
    deliveryState: "sent" as const,
  };
  const assistant: ChatMessage = {
    ...optimistic,
    id: "33333333-3333-4333-8333-333333333333",
    role: "assistant",
    body: "Answer",
    inReplyToClientRequestId: request,
  };
  expect(
    mergeAiHistory(
      [
        optimistic,
        { ...assistant, id: request + "-assistant", body: "Partial" },
      ],
      [human, assistant],
    ),
  ).toEqual([human, assistant]);
});
