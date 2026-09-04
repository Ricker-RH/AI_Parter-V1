import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HumanMediaControls } from "./HumanMediaControls";
const upload = vi.hoisted(() => vi.fn());
vi.mock("../../lib/human-media-client", () => ({
  mediaContentType: () => "image/png",
  uploadHumanMedia: upload,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});
const props = {
  peerId: "11111111-1111-4111-8111-111111111111",
  conversationId: "11111111-1111-4111-8111-111111111111",
  selfProfileId: "11111111-1111-4111-8111-111111111111",
  locale: "en" as const,
  disabled: false,
  onSent: vi.fn(),
  onError: vi.fn(),
  onBusy: vi.fn(),
};
it("stops a microphone granted after permission was cancelled", async () => {
  let resolve!: (stream: MediaStream) => void;
  const stop = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: () =>
        new Promise<MediaStream>((done) => {
          resolve = done;
        }),
    },
  });
  vi.stubGlobal("MediaRecorder", { isTypeSupported: () => true });
  render(<HumanMediaControls {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Voice" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await act(async () =>
    resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream),
  );
  expect(stop).toHaveBeenCalledOnce();
  expect(screen.queryByText("Stop recording")).toBeNull();
});
it("caps native recording and releases tracks and preview on unmount", async () => {
  vi.useFakeTimers();
  const stop = vi.fn(),
    revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => "blob:voice",
      revokeObjectURL: revoke,
    }),
  );
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [{ stop }] }),
    },
  });
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    state = "inactive";
    mimeType = "audio/webm";
    onstop = () => {};
    ondataavailable = (_event: { data: Blob }) => {};
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable({ data: new Blob(["voice"]) });
      this.onstop();
    }
  }
  vi.stubGlobal("MediaRecorder", Recorder);
  const view = render(<HumanMediaControls {...props} />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Voice" })),
  );
  act(() => vi.advanceTimersByTime(59000));
  expect(stop).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Send attachment" })).toBeTruthy();
  expect(upload).not.toHaveBeenCalled();
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:voice");
});
it("previews before sending and preserves finalized attachment and request ID when retrying", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const onSent = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    }),
  );
  upload.mockResolvedValue({
    attachmentId: id,
    kind: "image",
    contentType: "image/webp",
    sizeBytes: 5,
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ code: "UNAVAILABLE" }, { status: 503 }),
    )
    .mockImplementationOnce((_url, init) =>
      Response.json({
        message: {
          v: 1,
          id,
          conversationId: id,
          senderProfileId: id,
          clientRequestId: JSON.parse(init.body).clientRequestId,
          sequence: 1,
          createdAt: "2026-09-01T00:00:00Z",
          content: { kind: "image", attachmentId: id },
        },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(
    <HumanMediaControls
      peerId={id}
      conversationId={id}
      selfProfileId={id}
      locale="en"
      disabled={false}
      onSent={onSent}
      onError={() => {}}
      onBusy={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Choose image"), {
    target: { files: [new File(["image"], "test.png", { type: "image/png" })] },
  });
  expect(screen.getByAltText("Image preview")).toBeTruthy();
  expect(upload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send attachment" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Send attachment" }));
  await waitFor(() => expect(onSent).toHaveBeenCalledOnce());
  expect(upload).toHaveBeenCalledOnce();
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body).clientRequestId).toBe(
    JSON.parse(fetcher.mock.calls[1]?.[1].body).clientRequestId,
  );
});
