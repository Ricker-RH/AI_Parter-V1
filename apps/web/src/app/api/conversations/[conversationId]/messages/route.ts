import {
  ChatHistoryPageSchema,
  ChatSendInputSchema,
  ChatStreamEventSchema,
} from "@aifans/contracts";
import { fetchAifansApi } from "../../../../../lib/server-api";
import {
  cancelBody,
  duplicateTopLevelKey,
  invalidRequest,
  mime,
  readJsonBody,
  responseHeaders,
  sameOrigin,
  upstreamError,
  uuid,
} from "../../../../../lib/chat-proxy";
type Context = { params: Promise<{ conversationId: string }> };
async function reject(request: Request, body: object, status: number) {
  await cancelBody(request);
  return Response.json(body, { status });
}
const FRAME_LIMIT = 32_768,
  STREAM_LIMIT = 1_048_576,
  encoder = new TextEncoder();
function safeStream(upstream: ReadableStream<Uint8Array>, signal: AbortSignal) {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
    done = false;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0,
    buffer = "",
    state: "start" | "deltas" | "terminal" = "start";
  let abort = () => {};
  async function close(reason?: unknown) {
    if (done) return;
    done = true;
    signal.removeEventListener("abort", abort);
    try {
      await reader?.cancel(reason);
    } catch {}
    try {
      reader?.releaseLock();
    } catch {}
  }
  function event(raw: string) {
    const lines = raw.split(/\r?\n/).filter((line) => !line.startsWith(":"));
    if (!lines.length) return null;
    if (lines.length !== 1 || !lines[0]!.startsWith("data: ")) throw Error();
    const value = ChatStreamEventSchema.parse(JSON.parse(lines[0]!.slice(6)));
    if (
      (state === "start" && value.type !== "human_message") ||
      (state === "deltas" && value.type === "human_message") ||
      state === "terminal"
    )
      throw Error();
    if (value.type === "human_message") state = "deltas";
    if (value.type === "assistant_complete" || value.type === "failed")
      state = "terminal";
    return encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
  }
  return new ReadableStream<Uint8Array>(
    {
      start() {
        reader = upstream.getReader();
        abort = () => void close(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) void close(signal.reason);
      },
      async pull(controller) {
        try {
          for (;;) {
            const frame = /\r?\n\r?\n/.exec(buffer);
            if (frame) {
              const raw = buffer.slice(0, frame.index);
              buffer = buffer.slice(frame.index + frame[0].length);
              if (new TextEncoder().encode(raw).byteLength > FRAME_LIMIT)
                throw Error();
              const value = event(raw);
              if (value) {
                controller.enqueue(value);
                return;
              }
              continue;
            }
            const next = await reader!.read();
            if (next.done) {
              buffer += decoder.decode();
              if (buffer.trim() || state !== "terminal") throw Error();
              done = true;
              signal.removeEventListener("abort", abort);
              reader?.releaseLock();
              controller.close();
              return;
            }
            total += next.value.byteLength;
            if (total > STREAM_LIMIT) throw Error();
            buffer += decoder.decode(next.value, { stream: true });
            if (new TextEncoder().encode(buffer).byteLength > FRAME_LIMIT)
              throw Error();
          }
        } catch (error) {
          await close(error);
          controller.error(error);
        }
      },
      cancel(reason) {
        return close(reason);
      },
    },
    { highWaterMark: 0 },
  );
}
export async function GET(request: Request, context: Context) {
  const { conversationId } = await context.params;
  if (!uuid.test(conversationId)) {
    await cancelBody(request);
    return new Response(null, { status: 404 });
  }
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => key !== "cursor"))
    return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
  try {
    const upstream = await fetchAifansApi(
      `/v1/chat/conversations/${conversationId}/messages${url.search}`,
      {policy: 'private-cache'},
    );
    if (!upstream.ok) return upstreamError(upstream);
    const parsed = ChatHistoryPageSchema.safeParse(await upstream.json());
    return parsed.success
      ? Response.json(parsed.data, {
          status: upstream.status,
          headers: responseHeaders(upstream),
        })
      : Response.json({ code: "CHAT_INVALID_RESPONSE" }, { status: 502 });
  } catch {
    return Response.json({ code: "CHAT_UNAVAILABLE" }, { status: 503 });
  }
}
export async function POST(request: Request, context: Context) {
  const { conversationId } = await context.params;
  if (!uuid.test(conversationId)) {
    await cancelBody(request);
    return new Response(null, { status: 404 });
  }
  if (!sameOrigin(request))
    return reject(request, { code: "CSRF_REJECTED" }, 403);
  if (new URL(request.url).search)
    return reject(request, { code: "INVALID_REQUEST" }, 400);
  if (!mime(request, "application/json"))
    return reject(request, { code: "INVALID_REQUEST" }, 422);
  const input = await readJsonBody(request);
  if (input.kind === "too-large")
    return Response.json({ code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  if (
    input.kind !== "ok" ||
    !input.text.trim() ||
    duplicateTopLevelKey(input.text)
  )
    return invalidRequest();
  let value: unknown;
  try {
    value = JSON.parse(input.text);
  } catch {
    return invalidRequest();
  }
  const body = ChatSendInputSchema.safeParse(value);
  if (!body.success) return invalidRequest();
  try {
    const upstream = await fetchAifansApi(
      `/v1/chat/conversations/${conversationId}/messages`,
      {
        policy: 'live-no-store',
        requestInit: {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify(body.data),
          signal: request.signal,
        },
        trustedClientHeaders: request.headers,
      },
    );
    if (!upstream.ok) return upstreamError(upstream);
    if (!mime(upstream, "text/event-stream") || !upstream.body) {
      try {
        await upstream.body?.cancel();
      } catch {}
      return Response.json({ code: "CHAT_INVALID_RESPONSE" }, { status: 502 });
    }
    return new Response(safeStream(upstream.body, request.signal), {
      status: upstream.status,
      headers: responseHeaders(upstream, "text/event-stream; charset=utf-8"),
    });
  } catch {
    return Response.json({ code: "CHAT_UNAVAILABLE" }, { status: 503 });
  }
}
