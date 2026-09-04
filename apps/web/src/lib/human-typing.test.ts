import { expect, it, vi } from "vitest";
import { createTypingSignal } from "./human-typing";
it("throttles identity-free typing and clears on idle/disposal", () => {
  vi.useFakeTimers();
  const send = vi.fn();
  const typing = createTypingSignal("conversation", send);
  typing.change(true);
  typing.change(true);
  expect(send).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1000);
  typing.change(true);
  expect(send).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(5000);
  expect(send).toHaveBeenLastCalledWith({
    v: 1,
    type: "typing",
    conversationId: "conversation",
    isTyping: false,
  });
  typing.change(true);
  typing.dispose();
  expect(send).toHaveBeenLastCalledWith({
    v: 1,
    type: "typing",
    conversationId: "conversation",
    isTyping: false,
  });
  vi.useRealTimers();
});
