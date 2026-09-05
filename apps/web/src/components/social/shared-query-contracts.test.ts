import {QueryClient, type FetchQueryOptions, type QueryKey} from '@tanstack/react-query'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {homeFeedQueryOptions, loadHomeFeed} from './home-feed-query'
import {aiInboxQueryOptions} from '../chat/ai-inbox-query'
import {myProfileQueryOptions} from '../profile/my-profile-query'

const page={items:[],nextCursor:null}
function contract<T,K extends QueryKey>(entry:{name:string;options:(scope:string,locale:'en'|'zh-CN')=>FetchQueryOptions<T,Error,T,K>;key:unknown[];result:unknown}){
  return entry as unknown as {name:string;options:(scope:string,locale:'en'|'zh-CN')=>FetchQueryOptions;key:unknown[];result:unknown}
}
const cases=[
  contract({name:'home',options:(scope,locale)=>homeFeedQueryOptions(scope,locale,'for_you'),key:['home-feed','human:a','en','for_you',null],result:{status:'ok',data:page}}),
  contract({name:'inbox',options:aiInboxQueryOptions,key:['ai-chat','human:a','en','inbox',null],result:{status:'ok',data:page}}),
  contract({name:'profile',options:(scope,locale)=>myProfileQueryOptions(scope,locale,'ips'),key:['my-profile','human:a','en','ips',null],result:{status:'ready',...page}}),
]
afterEach(()=>vi.unstubAllGlobals())
it('preserves the legacy home result envelope and propagates aborts',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:401})))
  expect(await loadHomeFeed('for_you','en')).toEqual({status:'auth-required'})
  const abort=new DOMException('Aborted','AbortError')
  vi.stubGlobal('fetch',vi.fn(async()=>{throw abort}))
  await expect(loadHomeFeed('for_you','en')).rejects.toBe(abort)
})
it('keeps cursor routes and the people-and-IPs following key',async()=>{
  const cache=new QueryClient({defaultOptions:{queries:{retry:false}}})
  const request=vi.fn(async()=>Response.json({state:'ready',tab:'following',...page}));vi.stubGlobal('fetch',request)
  const query=myProfileQueryOptions('human:owner','en','following','next')
  expect(query.queryKey).toEqual(['my-profile','human:owner','en','following','next','people-and-ips'])
  await cache.fetchQuery(query)
  expect(request).toHaveBeenCalledWith('/api/humans/owner/tabs/following?limit=25&cursor=next',expect.objectContaining({signal:expect.any(AbortSignal)}))
  cache.clear()
})
describe.each(cases)('$name shared query',({options,key,result})=>{
  const client=()=>new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})
  it('shares a fresh prefetch with the page request using the exact key',async()=>{
    const cache=client();const request=vi.fn(async()=>Response.json(page));vi.stubGlobal('fetch',request)
    const query=options('human:a','en')
    expect(query.queryKey).toEqual(key);expect(query.staleTime).toBe(30_000)
    await cache.prefetchQuery(query)
    expect(await cache.fetchQuery(options('human:a','en'))).toEqual(result)
    expect(request).toHaveBeenCalledTimes(1);cache.clear()
  })
  it('deduplicates an in-flight warmup and on-demand fetch',async()=>{
    const cache=client();let resolve!:(response:Response)=>void
    const request=vi.fn(()=>new Promise<Response>(done=>{resolve=done}));vi.stubGlobal('fetch',request)
    const warming=cache.prefetchQuery(options('human:a','en'))
    const demand=cache.fetchQuery(options('human:a','en'))
    resolve(Response.json(page));await warming;expect(await demand).toEqual(result)
    expect(request).toHaveBeenCalledTimes(1);cache.clear()
  })
  it.each([401,503,200])('does not cache failed warmup %s and retries on demand',async(status)=>{
    const cache=client();const request=vi.fn().mockResolvedValueOnce(status===200?Response.json({invalid:true}):new Response(null,{status})).mockResolvedValueOnce(Response.json(page));vi.stubGlobal('fetch',request)
    const query=options('human:a','en');await cache.prefetchQuery(query)
    expect(cache.getQueryData(query.queryKey)).toBeUndefined()
    expect(cache.getQueryState(query.queryKey)?.error).toMatchObject({status:status===401?'auth-required':'unavailable'})
    expect(cache.getQueryState(query.queryKey)?.error).toBeInstanceOf(Error)
    expect(await cache.fetchQuery(query)).toEqual(result);expect(request).toHaveBeenCalledTimes(2);cache.clear()
  })
  it('isolates both account and locale',async()=>{
    const cache=client();const request=vi.fn(async()=>Response.json(page));vi.stubGlobal('fetch',request)
    await cache.prefetchQuery(options('human:a','en'));await cache.fetchQuery(options('human:b','en'));await cache.fetchQuery(options('human:a','zh-CN'))
    expect(request).toHaveBeenCalledTimes(3);cache.clear()
  })
  it('passes cancellation to fetch and leaves no successful snapshot',async()=>{
    const cache=client();let signal:AbortSignal|undefined
    vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise((_resolve,reject)=>{signal=init.signal;signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))})))
    const query=options('human:a','en');const warming=cache.prefetchQuery(query)
    await cache.cancelQueries({queryKey:query.queryKey});await warming
    expect(signal?.aborted).toBe(true);expect(cache.getQueryData(query.queryKey)).toBeUndefined();cache.clear()
  })
  it('retains a successful snapshot after a failed refetch',async()=>{
    const cache=client();vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json(page)).mockResolvedValueOnce(new Response(null,{status:503})))
    const query=options('human:a','en');await cache.fetchQuery(query)
    await expect(cache.fetchQuery({...query,staleTime:0})).rejects.toMatchObject({status:'unavailable'})
    expect(cache.getQueryData(query.queryKey)).toEqual(result);cache.clear()
  })
})
