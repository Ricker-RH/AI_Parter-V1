import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler/package.json'))
const {Miniflare,convertV4MiniflareOptions}=wranglerRequire('miniflare'),{build}=wranglerRequire('esbuild')
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',conversation='33333333-3333-4333-8333-333333333333',secret='local-ai-realtime-only-not-deployed-secret',origin='https://app.example'
async function until(predicate){for(let n=0;n<300;n++){if(predicate())return;await new Promise(r=>setTimeout(r,10))}throw Error('condition timed out')}
test('actual workerd: AI owner invalidations use separate subscriptions and never human presence', {timeout:20000},async()=>{
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/index.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2024',external:['cloudflare:workers']})
 const requests=[],messages=[[],[]],sockets=[];let allowed=true
 const mf=new Miniflare(convertV4MiniflareOptions({name:'ai-owner-realtime-test',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-04',cf:false,
  bindings:{ALLOWED_ORIGINS:origin,UPSTREAM_API_URL:'https://api.example',REALTIME_INTERNAL_SECRET:secret},durableObjects:{MAILBOXES:{className:'RealtimeMailbox',useSQLite:true}},
  ratelimits:{ADMISSION_LIMITER:{namespace_id:'2026090403',simple:{limit:10,period:10}}},
  outboundService:async request=>{
   const body=await request.json();requests.push({url:request.url,body})
   if(request.url.endsWith('/redeem'))return Response.json({subject:body.ticket,profileId:body.ticket,sessionId:body.ticket,sessionExpiresAt:Date.now()+60000})
   assert.ok(request.url.endsWith('/authorize'),'AI subscriptions must not emit human ephemeral calls')
   return Response.json({allowed:allowed&&body.profileId===owner&&body.conversationId===conversation&&body.eventType==='ai_generation',presenceAllowed:false})
  },
 }))
 try{
  for(const [i,id]of [owner,other].entries()){
   const r=await mf.dispatchFetch(`https://ws.example/connect/${id}`,{headers:{Upgrade:'websocket',Origin:origin,'CF-Connecting-IP':`203.0.113.${i+30}`}})
   const ws=r.webSocket;assert.ok(ws);ws.accept();sockets.push(ws);ws.addEventListener('message',e=>messages[i].push(JSON.parse(e.data)))
   ws.send(JSON.stringify({v:1,type:'auth',ticket:id}))
  }
  await until(()=>messages.every(list=>list.some(e=>e.type==='auth_ok')))
  for(const ws of sockets)ws.send(JSON.stringify({v:1,type:'subscribe_ai',conversationId:conversation}))
  await until(()=>requests.filter(r=>r.body.eventType==='ai_generation').length>=2)
  const event={v:1,type:'ai_generation',eventId:owner,conversationId:conversation,messageId:other,state:'partial',occurredAt:new Date().toISOString()}
  const publish=id=>mf.dispatchFetch(`https://ws.example/internal/events/${id}`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(event)})
  assert.equal((await publish(owner)).status,204);await until(()=>messages[0].some(e=>e.type==='ai_generation'))
  assert.equal((await publish(other)).status,204);assert.equal(messages[1].some(e=>e.type==='ai_generation'),false)
  allowed=false;event.eventId=other;assert.equal((await publish(owner)).status,204)
  assert.equal(messages[0].filter(e=>e.type==='ai_generation').length,1)
 }finally{for(const ws of sockets){try{ws.close()}catch{}}await mf.dispose()}
})
