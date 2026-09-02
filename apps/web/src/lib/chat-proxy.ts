import { ApiErrorSchema } from "@aifans/contracts";
const BODY_LIMIT = 32_768,
  ERROR_LIMIT = 32_768;
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mime(input: { headers: Headers }, value: string) {
  return (
    input.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() === value
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
export function duplicateTopLevelKey(text: string) {
  const keys = new Set<string>();
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      const start = index;
      for (index++; index < text.length; index++) {
        if (text[index] === "\\") index++;
        else if (text[index] === '"') break;
      }
      if (depth === 1) {
        let after = index + 1;
        while (/\s/.test(text[after] ?? "")) after++;
        if (text[after] === ":") {
          try {
            const key = JSON.parse(text.slice(start, index + 1));
            if (typeof key === "string") {
              if (keys.has(key)) return true;
              keys.add(key);
            }
          } catch {
            return true;
          }
        }
      }
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}") depth--;
  }
  return false;
}
export function responseHeaders(
  upstream: Response,
  contentType = "application/json",
) {
  const headers: Record<string, string> = {
    "content-type": contentType,
    "cache-control": contentType.startsWith("text/event-stream")
      ? "private, no-cache, no-store, no-transform"
      : "private, no-store",
  };
  const requestId = upstream.headers.get("x-request-id");
  if (requestId) headers["x-request-id"] = requestId;
  return headers;
}
export async function cancelBody(response: {
  body: ReadableStream<Uint8Array> | null;
}) {
  try {
    await response.body?.cancel();
  } catch {}
}
export async function readJsonBody(
  request: Request,
): Promise<
  { kind: "ok"; text: string } | { kind: "too-large" } | { kind: "invalid" }
> {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > BODY_LIMIT)
  ) {
    await cancelBody(request);
    return { kind: "too-large" };
  }
  if (!request.body) return { kind: "invalid" };
  const reader = request.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        size += value.byteLength;
        if (size > BODY_LIMIT) {
          try {
            await reader.cancel();
          } catch {}
          return { kind: "too-large" };
        }
        text += decoder.decode(value, { stream: true });
      }
    }
    return { kind: "ok", text: text + decoder.decode() };
  } catch {
    try {
      await reader.cancel();
    } catch {}
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }
}
export async function upstreamError(upstream: Response) {
  try {
    if (!mime(upstream, "application/json")) {
      await cancelBody(upstream);
      throw Error();
    }
    const declared = upstream.headers.get("content-length");
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > ERROR_LIMIT)
    ) {
      await cancelBody(upstream);
      throw Error();
    }
    const reader = upstream.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > ERROR_LIMIT) {
          try {
            await reader.cancel();
          } catch {}
          throw Error();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed = ApiErrorSchema.safeParse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    if (!parsed.success) throw Error();
    return Response.json(parsed.data, {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
  } catch {
    return Response.json({ code: "CHAT_INVALID_RESPONSE" }, { status: 502 });
  }
}
export function invalidRequest() {
  return Response.json({ code: "INVALID_REQUEST" }, { status: 422 });
}
