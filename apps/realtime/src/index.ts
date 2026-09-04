import { DurableObject } from "cloudflare:workers";
import { RealtimeEventSchema } from "@aifans/contracts";
import { admit, boundedJson, upstream, type Configuration } from "./gateway.js";
import {
  deadline,
  deliver,
  expire,
  initialize,
  receive,
  socketCounts,
  liveSessions,disconnect,expireTyping,typingDeadline,
} from "./session.js";
import {presenceChanges,ephemeralFresh,type PresenceState} from './presence.js';
import {z} from 'zod';
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
  private ephemeralTail:Promise<void>=Promise.resolve();
  private pendingEphemeral=0;
  async fetch(request: Request): Promise<Response> {
    const route = admit(request, this.env);
    if ("status" in route) return new Response(null, { status: route.status });
    // Trusted status checks current privacy/session authorization on every device.
    if(route.kind==='status') {
      let conversationId:string;
      try {conversationId=z.strictObject({conversationId:z.uuid()}).parse(await boundedJson(request,1024)).conversationId} catch {return new Response(null,{status:400})}
      try {
        const decisions=await Promise.all(liveSessions(this.ctx.getWebSockets(),Date.now()).map(async session=>{
          const access=await upstream(this.env).authorize(session.identity,conversationId,'presence');
          return access.allowed&&access.presenceAllowed&&liveSessions(this.ctx.getWebSockets(),Date.now()).some(current=>current.identity.sessionId===session.identity.sessionId);
        }));
        return Response.json({online:decisions.some(Boolean)},{headers:{'Cache-Control':'private, no-store'}});
      } catch {return new Response(null,{status:503})}
    }
    return this.ctx.blockConcurrencyWhile(async () => {
      if (route.kind === "event") {
        let event;
        try {
          event = RealtimeEventSchema.parse(await boundedJson(request));
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
        this.ports(),
        () =>
          socketCounts(this.ctx.getWebSockets(), Date.now()).authenticated < 5,
      );
      await this.syncPresence();
      await this.schedule();
    });
  }
  async webSocketClose(ws: WebSocket) {
    disconnect(ws);
    ws.close(1000, "closed");
    await this.syncPresence();
    await this.schedule();
  }
  async webSocketError(ws: WebSocket) {
    disconnect(ws);
    ws.close(1011, "connection error");
    await this.syncPresence();
    await this.schedule();
  }
  async alarm() {
    for (const ws of this.ctx.getWebSockets()) {await expireTyping(ws,this.ports());expire(ws, Date.now());}
    await this.syncPresence();
    await this.schedule();
  }
  private async schedule() {
    const deadlines = this.ctx
      .getWebSockets()
      .map(deadline)
      .filter((v): v is number => v !== null);
    deadlines.push(...this.ctx.getWebSockets().flatMap(typingDeadline));
    const presence=await this.ctx.storage.get<PresenceState>('presence');
    if(presence) deadlines.push(...Object.values(presence.conversations).map(value=>value.sentAt+30000));
    if (deadlines.length)
      await this.ctx.storage.setAlarm(
        Math.max(Date.now() + 1, Math.min(...deadlines)),
      );
    else await this.ctx.storage.deleteAlarm();
  }
  private ports() {
    const ports=upstream(this.env,(recipient,event)=>{
      // Queue trusted fanout without awaiting peer DOs while holding our gate.
      this.ctx.waitUntil(this.env.MAILBOXES.getByName(recipient).fetch(new Request(`https://realtime.internal/internal/events/${recipient}`,{
        method:'POST',headers:{Authorization:`Bearer ${this.env.REALTIME_INTERNAL_SECRET}`,'Content-Type':'application/json'},body:JSON.stringify(event),
      })).then(response=>{if(!response.ok) throw new Error('ephemeral delivery failed')}).catch(()=>{/* Ephemeral leases expire; never persist/replay. */}));
    });
    return {...ports,ephemeral:async(...args:Parameters<NonNullable<typeof ports.ephemeral>>)=>{
      // API snapshot may query another mailbox. Do not await that round-trip
      // inside blockConcurrencyWhile: reciprocal subscriptions could deadlock.
      if(this.pendingEphemeral>=64) return;
      const createdAt=Date.now();this.pendingEphemeral++;
      this.ephemeralTail=this.ephemeralTail.then(async()=>{
        if(ephemeralFresh(args[1],args[0],createdAt,Date.now(),liveSessions(this.ctx.getWebSockets(),Date.now()))) await ports.ephemeral!(...args);
      }).catch(()=>{/* Bounded client leases fail closed. */}).finally(()=>{this.pendingEphemeral--});
      this.ctx.waitUntil(this.ephemeralTail);
    }};
  }
  private async syncPresence() {
    const previous=await this.ctx.storage.get<PresenceState>('presence');
    const {state,events}=presenceChanges(previous,liveSessions(this.ctx.getWebSockets(),Date.now()),Date.now());
    await this.ctx.storage.put('presence',state);
    for(const event of events) {
      try {await this.ports().ephemeral?.(event.identity,{type:'presence',conversationId:event.conversationId,status:event.status,snapshot:event.snapshot})} catch { /* Failed lease expires in clients; next pulse retries. */ }
    }
  }
}
