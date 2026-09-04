import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Use the already pinned Wrangler toolchain; do not install another runtime.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire("miniflare");
const { build } = wranglerRequire("esbuild");
const profileId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";
const secret = "local-runtime-test-only-not-a-deployed-secret";
const origin = "https://app.example";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 500; i++) {
    if (predicate()) return;
    await pause(20);
  }
  throw new Error("runtime condition timed out");
}

test('actual workerd: reciprocal presence snapshots and typing fanout do not deadlock', {timeout:20000},async()=>{
  const peerId='66666666-6666-4666-8666-666666666666';
  const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/index.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2024',external:['cloudflare:workers']});
  let mf;
  mf=new Miniflare(convertV4MiniflareOptions({name:'ephemeral-cross-mailbox-test',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-04',cf:false,
    bindings:{ALLOWED_ORIGINS:origin,UPSTREAM_API_URL:'https://api.example',REALTIME_INTERNAL_SECRET:secret},durableObjects:{MAILBOXES:{className:'RealtimeMailbox',useSQLite:true}},
    ratelimits:{ADMISSION_LIMITER:{namespace_id:'2026090402',simple:{limit:10,period:10}}},
    outboundService:async request=>{
      const body=await request.json();assert.equal(request.headers.get('Authorization'),`Bearer ${secret}`);
      if(request.url.endsWith('/redeem'))return Response.json({subject:body.ticket,profileId:body.ticket,sessionId:body.ticket,sessionExpiresAt:Date.now()+60000});
      if(request.url.endsWith('/authorize'))return Response.json({allowed:true,presenceAllowed:true});
      assert.ok(request.url.endsWith('/ephemeral'));
      const recipient=body.profileId===profileId?peerId:profileId;
      const event={v:1,eventId:crypto.randomUUID(),conversationId,occurredAt:new Date().toISOString(),profileId:body.profileId,...(body.type==='typing'?{type:'typing',isTyping:body.isTyping}:{type:'presence',status:body.status})};
      const deliveries=[{recipientProfileId:recipient,event}];
      if(body.snapshot){
        const response=await mf.dispatchFetch(`https://ws.example/internal/status/${recipient}`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({conversationId})});
        assert.equal(response.status,200);
        deliveries.push({recipientProfileId:body.profileId,event:{...event,eventId:crypto.randomUUID(),profileId:recipient,type:'presence',status:(await response.json()).online?'online':'offline'}});
      }
      return Response.json({deliveries});
    },
  }));
  const sockets=[];const messages=[[],[]];
  try {
    for(const [index,id]of [profileId,peerId].entries()){
      const response=await mf.dispatchFetch(`https://ws.example/connect/${id}`,{headers:{Upgrade:'websocket',Origin:origin,'CF-Connecting-IP':`203.0.113.${index+10}`}});
      const ws=response.webSocket;assert.ok(ws);ws.accept();sockets.push(ws);ws.addEventListener('message',e=>messages[index].push(JSON.parse(e.data)));
      ws.send(JSON.stringify({v:1,type:'auth',ticket:id}));
    }
    await until(()=>messages.every(list=>list.some(e=>e.type==='auth_ok')));
    for(const ws of sockets)ws.send(JSON.stringify({v:1,type:'subscribe',conversationId}));
    await until(()=>messages.every(list=>list.some(e=>e.type==='presence'&&e.status==='online')));
    sockets[0].send(JSON.stringify({v:1,type:'typing',conversationId,isTyping:true}));
    await until(()=>messages[1].some(e=>e.type==='typing'&&e.isTyping&&e.profileId===profileId));
  }finally{for(const ws of sockets){try{ws.close()}catch{}}await mf.dispose()}
});

test(
  "actual workerd: origin-bound auth, session subscription, fanout and current block denial",
  { timeout: 30000 },
  async () => {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2024",
      external: ["cloudflare:workers"],
    });
    let allowed = true;
    let presenceAllowed = true;
    const requests = [];
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        name: "aifans-realtime-isolated-test",
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: "2026-09-04",
        cf: false,
        bindings: {
          ALLOWED_ORIGINS: origin,
          UPSTREAM_API_URL: "https://api.example",
          REALTIME_INTERNAL_SECRET: secret,
        },
        durableObjects: {
          MAILBOXES: { className: "RealtimeMailbox", useSQLite: true },
        },
        ratelimits: {
          ADMISSION_LIMITER: {
            namespace_id: "2026090401",
            simple: { limit: 10, period: 10 },
          },
        },
        outboundService: async (request) => {
          assert.equal(
            request.headers.get("Authorization"),
            `Bearer ${secret}`,
          );
          const body = await request.json();
          requests.push({ path: new URL(request.url).pathname, body });
          if (request.url.endsWith("/redeem")) {
            assert.equal(body.origin, origin);
            if (body.ticket === "redirect")
              return Response.redirect("https://unexpected.example", 302);
            return Response.json({
              subject: "runtime-subject",
              profileId: body.ticket === "invalid" ? conversationId : profileId,
              sessionId,
              sessionExpiresAt:
                Date.now() + (body.ticket === "short" ? 1000 : 60000),
            });
          }
          assert.equal(body.subject, "runtime-subject");
          assert.equal(body.profileId, profileId);
          assert.equal(body.sessionId, sessionId);
          assert.equal(body.conversationId, conversationId);
          if(request.url.endsWith('/ephemeral')) return Response.json({deliveries:[]});
          return Response.json({ allowed, presenceAllowed });
        },
      }),
    );
    const sockets = [];
    try {
      const endpoint = `https://ws.example/connect/${profileId}`;
      assert.equal(
        (
          await mf.dispatchFetch(endpoint, {
            headers: { Upgrade: "websocket", Origin: "https://evil.example" },
          })
        ).status,
        403,
      );
      const response = await mf.dispatchFetch(endpoint, {
        headers: {
          Upgrade: "websocket",
          Origin: origin,
          "CF-Connecting-IP": "203.0.113.1",
        },
      });
      assert.equal(response.status, 101);
      const ws = response.webSocket;
      assert.ok(ws);
      sockets.push(ws);
      ws.accept();
      const messages = [];
      ws.addEventListener("message", (event) =>
        messages.push(JSON.parse(event.data)),
      );
      ws.send(JSON.stringify({ v: 1, type: "auth", ticket: "valid" }));
      await until(() => messages.length > 0);
      assert.deepEqual(
        messages[0],
        { v: 1, type: "auth_ok" },
        `auth response; upstream requests: ${requests.map((request) => request.path).join(",")}`,
      );
      ws.send(JSON.stringify({ v: 1, type: "subscribe", conversationId }));
      await until(() =>
        requests.some((request) => request.path.endsWith("/authorize")),
      );
      ws.send(JSON.stringify({v:1,type:'typing',conversationId,isTyping:true}));
      await until(()=>requests.some(request=>request.path.endsWith('/ephemeral')&&request.body.type==='typing'&&request.body.isTyping));
      await until(()=>requests.some(request=>request.path.endsWith('/ephemeral')&&request.body.type==='typing'&&request.body.isTyping===false));
      const event = {
        v: 1,
        eventId: "44444444-4444-4444-8444-444444444444",
        conversationId,
        occurredAt: "2026-09-04T00:00:00Z",
        type: "typing",
        profileId,
        isTyping: true,
      };
      const publish = (value, authenticated = true) =>
        mf.dispatchFetch(`https://ws.example/internal/events/${profileId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authenticated ? { Authorization: `Bearer ${secret}` } : {}),
          },
          body: JSON.stringify(value),
        });
      assert.equal((await publish(event, false)).status, 403);
      assert.equal((await publish(event)).status, 204);
      await until(() => messages.some((message) => message.type === "typing"));
      const { isTyping, ...base } = event;
      presenceAllowed=false;
      assert.equal(
        (await publish({ ...base, type: "presence", status: "online" })).status,
        204,
      );
      await pause(100);
      assert.equal(
        messages.some((message) => message.type === "presence"),
        false,
      );
      allowed = false;
      assert.equal(
        (
          await publish({
            ...event,
            eventId: "55555555-5555-4555-8555-555555555555",
          })
        ).status,
        204,
      );
      await pause(100);
      assert.equal(
        messages.filter((message) => message.type === "typing").length,
        1,
      );
      assert.ok(
        requests.filter((request) => request.path.endsWith("/authorize"))
          .length >= 3,
      );
      const denied = await mf.dispatchFetch(endpoint, {
        headers: {
          Upgrade: "websocket",
          Origin: origin,
          "CF-Connecting-IP": "203.0.113.2",
        },
      });
      const deniedWs = denied.webSocket;
      assert.ok(deniedWs);
      sockets.push(deniedWs);
      deniedWs.accept();
      const denial = [];
      deniedWs.addEventListener("message", (event) =>
        denial.push(JSON.parse(event.data)),
      );
      deniedWs.send(JSON.stringify({ v: 1, type: "auth", ticket: "invalid" }));
      await until(() =>
        denial.some((message) => message.type === "auth_error"),
      );
      allowed=true;presenceAllowed=true;
      const secondResponse=await mf.dispatchFetch(endpoint,{headers:{Upgrade:'websocket',Origin:origin,'CF-Connecting-IP':'203.0.113.9'}});
      const second=secondResponse.webSocket;second.accept();sockets.push(second);
      let secondReady=false;second.addEventListener('message',e=>{if(JSON.parse(e.data).type==='auth_ok')secondReady=true});
      second.send(JSON.stringify({v:1,type:'auth',ticket:'valid'}));await until(()=>secondReady);
      const status=async()=>{
        const r=await mf.dispatchFetch(`https://ws.example/internal/status/${profileId}`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({conversationId})});
        assert.equal(r.status,200);return (await r.json()).online;
      };
      assert.equal(await status(),true);
      const offlineCount=()=>requests.filter(r=>r.path.endsWith('/ephemeral')&&r.body.status==='offline').length;
      const beforeOffline=offlineCount();ws.close();await pause(100);
      assert.equal(await status(),true);assert.equal(offlineCount(),beforeOffline);
      presenceAllowed=false;assert.equal(await status(),false);presenceAllowed=true;
      second.close();await until(()=>offlineCount()>beforeOffline);assert.equal(await status(),false);
      for (const ticket of ["redirect", "short"]) {
        const r = await mf.dispatchFetch(endpoint, {
          headers: {
            Upgrade: "websocket",
            Origin: origin,
            "CF-Connecting-IP": "203.0.113.3",
          },
        });
        const socket = r.webSocket;
        assert.ok(socket);
        sockets.push(socket);
        socket.accept();
        const events = [];
        let closed;
        socket.addEventListener("message", (event) =>
          events.push(JSON.parse(event.data)),
        );
        socket.addEventListener("close", (event) => {
          closed = event.code;
        });
        socket.send(JSON.stringify({ v: 1, type: "auth", ticket }));
        if (ticket === "redirect")
          await until(() =>
            events.some((event) => event.type === "auth_error"),
          );
        else {
          await until(() => events.some((event) => event.type === "auth_ok"));
          await until(() => closed === 4408);
        }
      }
      assert.equal(
        requests.some((request) => request.path === "/"),
        false,
        "upstream redirect must never be followed",
      );
    } finally {
      for (const socket of sockets) {try {socket.close()} catch {/* Already closed by lifecycle assertions. */}}
      await mf.dispose();
    }
  },
);
