import {FeedPageSchema} from '@aifans/contracts'
import {fetchAifansApi} from '../../../lib/server-api'
import type {Locale} from '../../../i18n/config'

const cursorPattern=/^[A-Za-z0-9_-]{1,2048}$/

export async function GET(request:Request){
  const url=new URL(request.url)
  const kind=url.searchParams.get('kind')
  const locale=url.searchParams.get('locale')
  const cursors=url.searchParams.getAll('cursor')
  const cursor=cursors[0]
  if([...url.searchParams.keys()].some((key)=>key!=='kind'&&key!=='locale'&&key!=='cursor')||url.searchParams.getAll('kind').length!==1||url.searchParams.getAll('locale').length!==1||cursors.length>1||(kind!=='for_you'&&kind!=='following')||(locale!=='en'&&locale!=='zh-CN')||(cursor!==undefined&&!cursorPattern.test(cursor)))return Response.json({code:'INVALID_REQUEST'},{status:400})
  const query=new URLSearchParams({kind,locale:locale as Locale})
  if(cursor)query.set('cursor',cursor)
  try{
    const upstream=await fetchAifansApi(`/v1/feed?${query}`,{policy:'private-cache',requestInit:{method:'GET'},trustedClientHeaders:request.headers})
    if(upstream.status===401)return Response.json({code:'AUTH_REQUIRED'},{status:401,headers:{'cache-control':'private, no-store'}})
    const body:unknown=await upstream.json()
    const page=FeedPageSchema.safeParse(body)
    if(!upstream.ok||!page.success)return Response.json({code:'FEED_UNAVAILABLE'},{status:upstream.status>=500?upstream.status:502,headers:{'cache-control':'private, no-store'}})
    return Response.json(page.data,{headers:{'cache-control':'private, no-store'}})
  }catch{return Response.json({code:'FEED_UNAVAILABLE'},{status:503,headers:{'cache-control':'private, no-store'}})}
}
