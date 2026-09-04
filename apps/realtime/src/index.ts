import { DurableObject } from "cloudflare:workers";
import { HumanRealtimeEventSchema } from "@aifans/contracts";
import { admit, boundedJson, upstream, type Configuration } from "./gateway.js";
import {
  deadline,
  deliver,
  expire,
  initialize,
  receive,
  socketCounts,
} from "./session.js";
import { edgeAdmission } from "./admission.js";
import {drainOutbox} from './drain.js'
export interface Env extends Configuration {
  MAILBOXES: DurableObjectNamespace<RealtimeMailbox>;
  ADMISSION_LIMITER?: RateLimit;
}
export default {
  async scheduled(_controller:ScheduledController,env:Env):Promise<void> {
    await drainOutbox(env)
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const route = admit(request, env);
    if ("status" in route) return new Response(null, { status: route.status });
    if (route.kind === "connect") {
      const denied = await edgeAdmission(request, env.ADMISSION_LIMITER);
      if (denied !== null) return new Response(null, { status: denied });
    }
    // Untrusted path selects an object only; ticket identity must match it.
    return env.MAILBOXES.getByName(route.profileId).fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class RealtimeMailbox extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const route = admit(request, this.env);
    if ("status" in route) return new Response(null, { status: route.status });
    return this.ctx.blockConcurrencyWhile(async () => {
      if (route.kind === "event") {
        let event;
        try {
          event = HumanRealtimeEventSchema.parse(await boundedJson(request));
        } catch {
          return new Response(null, { status: 400 });
        }
        // Each device revalidates upstream; no browser-originated event publishing.
        await Promise.all(
          this.ctx
            .getWebSockets()
            .map((ws) => deliver(ws, event, upstream(this.env))),
        );
        await this.schedule();
        return new Response(null, { status: 204 });
      }
      if (socketCounts(this.ctx.getWebSockets(), Date.now()).pending >= 10)
        return new Response(null, { status: 429 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      initialize(pair[1], route.profileId, route.origin, Date.now());
      await this.schedule();
      return new Response(null, { status: 101, webSocket: pair[0] });
    });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.ctx.blockConcurrencyWhile(async () => {
      await receive(
        ws,
        message,
        upstream(this.env),
        () =>
          socketCounts(this.ctx.getWebSockets(), Date.now()).authenticated < 5,
      );
      await this.schedule();
    });
  }
  async webSocketClose(ws: WebSocket) {
    ws.close(1000, "closed");
    await this.schedule();
  }
  async webSocketError(ws: WebSocket) {
    ws.close(1011, "connection error");
    await this.schedule();
  }
  async alarm() {
    for (const ws of this.ctx.getWebSockets()) expire(ws, Date.now());
    await this.schedule();
  }
  private async schedule() {
    const deadlines = this.ctx
      .getWebSockets()
      .map(deadline)
      .filter((v): v is number => v !== null);
    if (deadlines.length)
      await this.ctx.storage.setAlarm(
        Math.max(Date.now() + 1, Math.min(...deadlines)),
      );
    else await this.ctx.storage.deleteAlarm();
  }
}
