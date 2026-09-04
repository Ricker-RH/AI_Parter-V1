import { expect, it, vi } from "vitest";
import * as gateway from "./gateway.js";
const profile = "11111111-1111-4111-8111-111111111111";
const env = {
  ALLOWED_ORIGINS: "https://app.example",
  UPSTREAM_API_URL: "https://api.example",
  REALTIME_INTERNAL_SECRET: "x".repeat(32),
};
it('adds an optional server-only automation bypass only to fixed upstream requests',async()=>{
 const secret='test-only-automation-bypass';
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({allowed:true,presenceAllowed:false}));vi.stubGlobal('fetch',fetcher);
 try{
  const identity={subject:'human',profileId:profile,sessionId:profile,sessionExpiresAt:Date.now()+60000};
  await gateway.upstream({...env,VERCEL_AUTOMATION_BYPASS_SECRET:secret}).authorize(identity,profile);
  const [url,init]=fetcher.mock.calls[0]!;const headers=new Headers(init?.headers);
  expect(url).toBe('https://api.example/v1/internal/realtime/authorize');expect(init?.redirect).toBe('manual');
  expect(headers.get('x-vercel-protection-bypass')).toBe(secret);expect(headers.get('authorization')).toBe(`Bearer ${env.REALTIME_INTERNAL_SECRET}`);
  expect(init?.body).not.toContain(secret);expect(headers.has('x-vercel-set-bypass-cookie')).toBe(false);
  fetcher.mockResolvedValue(Response.json({allowed:true,presenceAllowed:false}));await gateway.upstream(env).authorize(identity,profile);
  expect(new Headers(fetcher.mock.calls[1]![1]?.headers).has('x-vercel-protection-bypass')).toBe(false);
  fetcher.mockResolvedValue(new Response(null,{status:302,headers:{location:'https://evil.example'}}));
  await expect(gateway.upstream({...env,VERCEL_AUTOMATION_BYPASS_SECRET:secret}).authorize(identity,profile)).rejects.toThrow('upstream rejected');
  expect(fetcher).toHaveBeenCalledTimes(3);
 }finally{vi.unstubAllGlobals()}
});
it('rejects malformed optional bypass configuration without admitting a request',()=>{
 for(const secret of ['', ' white ', 'line\r\nbreak', 'trailing\n', 'x'.repeat(4097)])expect(gateway.configured({...env,VERCEL_AUTOMATION_BYPASS_SECRET:secret})).toBe(false);
 expect(gateway.configured(env)).toBe(true);
});
it('admits status reads only with internal auth',()=>{
 const url=`https://ws.example/internal/status/${profile}`;
 expect(gateway.admit(new Request(url,{method:'POST'}),env)).toEqual({status:403});
 expect(gateway.admit(new Request(url,{method:'POST',headers:{Authorization:`Bearer ${env.REALTIME_INTERNAL_SECRET}`}}),env)).toEqual({kind:'status',profileId:profile});
});
it("exports fail-closed request admission", () =>
  expect(gateway.admit).toBeTypeOf("function"));
it("enforces streamed body byte limit without content-length", async () => {
  await expect(
    gateway.boundedJson(new Response("x".repeat(16385))),
  ).rejects.toThrow("body too large");
  await expect(
    gateway.boundedJson(new Response('{"ok":true}')),
  ).resolves.toEqual({ ok: true });
});
it("rejects missing config, origins, credential query strings and wrong methods", () => {
  expect(
    gateway.admit(new Request(`https://ws.example/connect/${profile}`), {}),
  ).toEqual({ status: 503 });
  for (const headers of [
    { Upgrade: "websocket" },
    { Upgrade: "websocket", Origin: "https://evil.example" },
  ])
    expect(
      gateway.admit(
        new Request(`https://ws.example/connect/${profile}`, { headers }),
        env,
      ),
    ).toEqual({ status: 403 });
  expect(
    gateway.admit(
      new Request(`https://ws.example/connect/${profile}?ticket=secret`, {
        headers: { Upgrade: "websocket", Origin: "https://app.example" },
      }),
      env,
    ),
  ).toEqual({ status: 400 });
  expect(
    gateway.admit(
      new Request(`https://ws.example/connect/${profile}`, {
        headers: { Upgrade: "websocket", Origin: "https://app.example" },
      }),
      env,
    ),
  ).toEqual({
    profileId: profile,
    kind: "connect",
    origin: "https://app.example",
  });
});
it("internal fanout requires shared secret and strict profile routing", () => {
  expect(
    gateway.admit(
      new Request(`https://ws.example/internal/events/${profile}`, {
        method: "POST",
      }),
      env,
    ),
  ).toEqual({ status: 403 });
  expect(
    gateway.admit(
      new Request(`https://ws.example/internal/events/${profile}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.REALTIME_INTERNAL_SECRET}` },
      }),
      env,
    ),
  ).toEqual({ profileId: profile, kind: "event" });
});
