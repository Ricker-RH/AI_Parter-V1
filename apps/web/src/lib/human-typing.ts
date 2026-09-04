import type { RealtimeTyping } from "./realtime-transport";
export function createTypingSignal(
  conversationId: string,
  send: (frame: RealtimeTyping) => void,
) {
  let last = -Infinity,
    active = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    if (active) send({ v: 1, type: "typing", conversationId, isTyping: false });
    active = false;
  };
  return {
    change(isTyping: boolean) {
      if (!isTyping) {
        stop();
        return;
      }
      clearTimeout(timer);
      if (Date.now() - last >= 1000) {
        send({ v: 1, type: "typing", conversationId, isTyping: true });
        last = Date.now();
        active = true;
      }
      timer = setTimeout(stop, 5000);
    },
    dispose: stop,
  };
}
