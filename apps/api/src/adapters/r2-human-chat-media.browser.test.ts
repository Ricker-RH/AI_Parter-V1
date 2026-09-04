import {chromium,webkit} from '@playwright/test'
import {describe,it,expect} from 'vitest'
import {createR2HumanChatMediaStorage} from './r2-human-chat-media.js'
const suite=process.env.HUMAN_MEDIA_BROWSER_TEST==='1'?describe:describe.skip
suite('native browser voice container verification',()=>{
 for(const [name,engine,mime] of [['chromium',chromium,'audio/webm'],['webkit',webkit,'audio/mp4']] as const){
  it(`${name} synthetic audio records and finalizes genuine ${mime} bytes`,async()=>{
   const browser=await engine.launch({headless:true})
   try{
    const page=await browser.newPage()
    const recorded=await page.evaluate(async(type)=>{
     if(!MediaRecorder.isTypeSupported(type))throw new Error(`UNSUPPORTED:${type}`)
     const context=new AudioContext(),destination=context.createMediaStreamDestination(),oscillator=context.createOscillator()
     oscillator.connect(destination);oscillator.start();await context.resume()
     const recorder=new MediaRecorder(destination.stream,{mimeType:type}),chunks:Blob[]=[]
     const done=new Promise<Blob>(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>resolve(new Blob(chunks,{type}))})
     recorder.start();await new Promise(resolve=>setTimeout(resolve,800));recorder.stop()
     const bytes=Array.from(new Uint8Array(await(await done).arrayBuffer()))
     oscillator.stop();destination.stream.getTracks().forEach(t=>t.stop());await context.close()
     return bytes
    },mime)
    const source=new Uint8Array(recorded),owner='edc5b166-125d-4af3-ac8c-233a773f66c1',id='edc5b166-125d-4af3-ac8c-233a773f66c2'
    const staging=`private/human-chat/${owner}/${id}/staging`,final=`private/human-chat/${owner}/${id}/final`
    const written:Uint8Array[]=[]
    const storage=createR2HumanChatMediaStorage({endpoint:'https://private.test',bucket:'private',accessKeyId:'test',secretAccessKey:'test'},{read:async({key})=>key===staging?source:null,write:async({body})=>{written.push(body)},signPut:async()=>'',signGet:async()=>''})
    const result=await storage.finalize({attachmentId:id,ownerProfileId:owner,peerProfileId:owner,conversationId:id,kind:'voice',contentType:mime,sizeBytes:source.length,expiresAt:new Date().toISOString(),stagingObjectKey:staging,finalObjectKey:final,attachment:null})
    expect(result.contentType).toBe(mime);expect(result.sizeBytes).toBe(source.length);expect(Array.from(written[0]!)).toEqual(Array.from(source))
    if(result.durationMs!==undefined)expect(result.durationMs).toBeGreaterThan(0)
   }finally{await browser.close()}
  },20000)
 }
})
