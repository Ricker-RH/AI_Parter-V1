import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import type {SocialLabels} from '../social/types.js'
import {AppQueryContext} from '../AppQueryProvider.js'
import {MyProfileTabs} from './MyProfileTabs.js'

vi.mock('next/navigation', () => ({useRouter: () => ({prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn()})}))

const labels = {tabs:'Profile sections',myIps:'My IPs',liked:'Liked',saved:'Saved',following:'Following',loadingSection:'Loading section…',authRequired:'Sign in to view your profile.',signIn:'Sign in',unavailableSection:'Unable to load this section.',retrySection:'Try again',myIpsEmpty:'No IPs yet',likedEmpty:'No liked posts yet',savedEmpty:'No saved posts yet',followingEmpty:'Not following anyone yet'}
const socialLabels = {posts:'Posts',postMedia:'Post media',createdBy:'Created by',like:'Like',unlike:'Unlike',bookmark:'Save',removeBookmark:'Remove save',comments:'Comments',share:'Share',interactionError:'Action failed',loadMore:'Load more'} as SocialLabels
const refs=['avatar','cover','portrait','full_body','supporting_1'].map((role,index)=>({id:`33333333-3333-4333-8333-33333333333${index}`,role}))
const ip = {id:'11111111-1111-4111-8111-111111111111',username:'luma',displayName:'Luma',shortDescription:'Moon notes',languageCodes:['en'],contentThemes:[],visualType:'anime',status:'public',operationEnabled:false,creator:{id:'77777777-7777-4777-8777-777777777777',username:'rui',displayName:'Rui'},references:refs,createdAt:'2026-09-01T00:00:00.000Z'}
const author = {kind:'ip',id:ip.id,username:ip.username,displayName:ip.displayName,bio:ip.shortDescription,languages:['en'],visualType:'anime'}
const post = {id:'22222222-2222-4222-8222-222222222222',body:'A real liked post',languageCode:'en',publishedAt:'2026-09-01T00:00:00.000Z',author,likeCount:1,commentCount:0,bookmarkCount:0,shareCount:0}
const nextIp = {...ip,id:'44444444-4444-4444-8444-444444444444',username:'nova',displayName:'Nova'}
const nextPost = {...post,id:'55555555-5555-4555-8555-555555555555',body:'A later page post'}
const followed = {...author,followerCount:4}
const nextFollowed = {...followed,id:'66666666-6666-4666-8666-666666666666',username:'sola',displayName:'Sola'}

const remoteTabs = [
  {name:'My IPs',path:'/api/creator/ips?limit=25',first:{items:[ip],nextCursor:'next_page'},second:{items:[nextIp],nextCursor:null},firstText:'Luma',secondText:'Nova'},
  {name:'Liked',path:'/api/social/likes',first:{items:[post],nextCursor:'next_page'},second:{items:[nextPost],nextCursor:null},firstText:'A real liked post',secondText:'A later page post'},
  {name:'Saved',path:'/api/social/bookmarks',first:{items:[post],nextCursor:'next_page'},second:{items:[nextPost],nextCursor:null},firstText:'A real liked post',secondText:'A later page post'},
  {name:'Following',path:'/api/social/following',first:{items:[followed],nextCursor:'next_page'},second:{items:[nextFollowed],nextCursor:null},firstText:'Luma',secondText:'Sola'},
] as const

afterEach(() => vi.unstubAllGlobals())

describe('MyProfileTabs', () => {
  it('keeps loaded profile items visible after a background refetch fails',async()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    const key=['my-profile','viewer-a','en','ips',null]
    client.setQueryData(key,{status:'ready',items:[ip],nextCursor:null})
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:503})))
    render(<QueryClientProvider client={client}><AppQueryContext.Provider value><MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels} viewerScope="viewer-a"/></AppQueryContext.Provider></QueryClientProvider>)
    await act(async()=>{await client.invalidateQueries({queryKey:key})})
    expect(client.getQueryData(key)).toMatchObject({status:'ready',items:[ip]})
    expect(screen.getByRole('link',{name:'Luma'})).toBeVisible()
  })

  it('loads real creator IP assets and provides roving four-tab navigation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({items:[ip],nextCursor:null})))
    render(<MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels}/>)
    expect(await screen.findByRole('link', {name:'Luma'})).toHaveAttribute('href', `/en/profiles/${ip.id}`)
    const tabs=screen.getAllByRole('tab'); expect(tabs).toHaveLength(4); expect(tabs[0]).toHaveAttribute('tabindex','0')
    fireEvent.keyDown(tabs[0]!,{key:'End'});expect(screen.getByRole('tab',{name:'Following'})).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab',{name:'Following'}),{key:'Home'});expect(screen.getByRole('tab',{name:'My IPs'})).toHaveFocus()
  })

  it('uses standard PostCard feeds for liked and saved data', async () => {
    const request=vi.fn(async(input:RequestInfo|URL)=>Response.json(String(input).includes('likes')?{items:[post],nextCursor:null}:{items:[],nextCursor:null}));vi.stubGlobal('fetch',request)
    render(<MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels}/>)
    fireEvent.click(screen.getByRole('tab',{name:'Liked'}));expect(await screen.findByText('A real liked post')).toBeVisible();expect(screen.getByText('A real liked post').closest('article')).toHaveClass('post-card');expect(request).toHaveBeenCalledWith('/api/social/likes',expect.objectContaining({credentials:'same-origin'}))
    fireEvent.click(screen.getByRole('tab',{name:'Saved'}));expect(await screen.findByRole('heading',{name:'No saved posts yet'})).toBeVisible()
  })

  it('loads real followed IP profiles from the authenticated owner projection', async () => {
    const request=vi.fn(async(input:RequestInfo|URL)=>Response.json(String(input).includes('following')?{items:[followed],nextCursor:null}:{items:[],nextCursor:null}))
    vi.stubGlobal('fetch',request)
    render(<MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels}/>)

    await screen.findByRole('heading',{name:'No IPs yet'})
    fireEvent.click(screen.getByRole('tab',{name:'Following'}))

    expect(await screen.findByRole('link',{name:'Luma'})).toHaveAttribute('href',`/en/profiles/${followed.id}`)
    expect(request).toHaveBeenCalledWith('/api/social/following',expect.objectContaining({credentials:'same-origin'}))
  })

  it.each(remoteTabs)('$name appends cursor pages without dropping nextCursor',async({name,path,first,second,firstText,secondText})=>{
    const request=vi.fn(async(input:RequestInfo|URL)=>{
      const url=String(input)
      if(url.startsWith(path))return Response.json(url.includes('cursor=next_page')?second:first)
      return Response.json({items:[],nextCursor:null})
    })
    vi.stubGlobal('fetch',request)
    render(<MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels}/>)
    if(name!=='My IPs')fireEvent.click(screen.getByRole('tab',{name}))
    expect(await screen.findByText(firstText)).toBeVisible()

    fireEvent.click(screen.getByRole('button',{name:'Load more'}))

    expect(await screen.findByText(secondText)).toBeVisible()
    expect(request).toHaveBeenCalledWith(`${path}${path.includes('?')?'&':'?'}cursor=next_page`,expect.objectContaining({credentials:'same-origin'}))
    expect(screen.queryByRole('button',{name:'Load more'})).not.toBeInTheDocument()
  })

  it.each(remoteTabs)('$name classifies a 401 as auth instead of unavailable',async({name})=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:401})))
    render(<MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels}/>)
    if(name!=='My IPs')fireEvent.click(screen.getByRole('tab',{name}))

    expect(await screen.findByText('Sign in to view your profile.')).toBeVisible()
    expect(screen.getByRole('link',{name:'Sign in'})).toHaveAttribute('href','/en/auth/sign-in?next=%2Fen%2Fprofile')
    expect(screen.queryByText('Unable to load this section.')).not.toBeInTheDocument()
  })

  it.each(remoteTabs)('$name exposes retry after an unavailable response',async({name,path})=>{
    let attempts=0
    const request=vi.fn(async(input:RequestInfo|URL)=>{
      if(String(input).startsWith(path)){attempts+=1;return attempts===1?new Response(null,{status:503}):Response.json({items:[],nextCursor:null})}
      return Response.json({items:[],nextCursor:null})
    })
    vi.stubGlobal('fetch',request)
    render(<MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels}/>)
    if(name!=='My IPs')fireEvent.click(screen.getByRole('tab',{name}))
    expect(await screen.findByText('Unable to load this section.')).toBeVisible()

    fireEvent.click(screen.getByRole('button',{name:'Try again'}))

    expect(await screen.findByRole('heading',{name:name==='My IPs'?'No IPs yet':name==='Liked'?'No liked posts yet':name==='Saved'?'No saved posts yet':'Not following anyone yet'})).toBeVisible()
  })

  it('keeps loaded items and offers one cursor retry when loading more fails',async()=>{
    let attempts=0
    vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
      if(!String(input).startsWith('/api/creator/ips'))return Response.json({items:[],nextCursor:null})
      attempts+=1
      if(attempts===1)return Response.json({items:[ip],nextCursor:'next_page'})
      if(attempts===2)return new Response(null,{status:503})
      return Response.json({items:[nextIp],nextCursor:null})
    }))
    render(<MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels}/>)
    expect(await screen.findByText('Luma')).toBeVisible()

    fireEvent.click(screen.getByRole('button',{name:'Load more'}))

    expect(await screen.findByText('Unable to load this section.')).toBeVisible()
    expect(screen.getByText('Luma')).toBeVisible()
    expect(screen.queryByRole('button',{name:'Load more'})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Try again'}))
    expect(await screen.findByText('Nova')).toBeVisible()
  })

  it('does not hide a nextCursor when an intermediate page has no items',async()=>{
    const request=vi.fn()
      .mockResolvedValueOnce(Response.json({items:[],nextCursor:'next_page'}))
      .mockResolvedValueOnce(Response.json({items:[nextIp],nextCursor:null}))
    vi.stubGlobal('fetch',request)
    render(<MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels}/>)

    expect(await screen.findByRole('button',{name:'Load more'})).toBeVisible()
    fireEvent.click(screen.getByRole('button',{name:'Load more'}))

    expect(await screen.findByText('Nova')).toBeVisible()
    expect(request).toHaveBeenLastCalledWith('/api/creator/ips?limit=25&cursor=next_page',expect.objectContaining({credentials:'same-origin'}))
  })

  it('reuses a loaded private tab only for the same viewer scope',async()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    const request=vi.fn().mockResolvedValue(Response.json({items:[ip],nextCursor:null}))
    vi.stubGlobal('fetch',request)
    const content=<QueryClientProvider client={client}><AppQueryContext.Provider value><MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels} viewerScope="viewer-a"/></AppQueryContext.Provider></QueryClientProvider>
    const first=render(content)
    expect(await screen.findByRole('link',{name:'Luma'})).toBeVisible()
    first.unmount()
    render(<QueryClientProvider client={client}><AppQueryContext.Provider value><MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels} viewerScope="viewer-a"/></AppQueryContext.Provider></QueryClientProvider>)
    expect(screen.getByRole('link',{name:'Luma'})).toBeVisible()
    expect(request).toHaveBeenCalledTimes(1)
  })

})

it('loads both people and IPs from the owner following collection', async()=>{
 const owner='77777777-7777-4777-8777-777777777777'
 const person={kind:'human',id:'88888888-8888-4888-8888-888888888888',username:'friend',displayName:'Human friend',avatarUrl:null}
 const fetcher=vi.fn(async(url:string)=>Response.json(url.includes('/tabs/following')?{state:'ready',tab:'following',items:[person,author],nextCursor:null}:{items:[],nextCursor:null}))
 vi.stubGlobal('fetch',fetcher)
 render(<MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels} viewerScope={`human:${owner}`}/> )
 fireEvent.click(screen.getByRole('tab',{name:'Following'}))
 expect(await screen.findByRole('link',{name:'Human friend'})).toHaveAttribute('href',`/en/humans/${person.id}`)
 expect(screen.getByRole('link',{name:'Luma'})).toHaveAttribute('href',`/en/profiles/${author.id}`)
 expect(fetcher).toHaveBeenCalledWith(`/api/humans/${owner}/tabs/following?limit=25`,expect.anything())
})
