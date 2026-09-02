import {fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import type {SocialLabels} from '../social/types.js'
import {MyProfileTabs} from './MyProfileTabs.js'

vi.mock('next/navigation', () => ({useRouter: () => ({prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn()})}))

const labels = {tabs:'Profile sections',myIps:'My IPs',liked:'Liked',saved:'Saved',following:'Following',loadingSection:'Loading section…',unavailableSection:'Unable to load this section.',retrySection:'Try again',myIpsEmpty:'No IPs yet',likedEmpty:'No liked posts yet',savedEmpty:'No saved posts yet',followingEmpty:'Not following anyone yet'}
const socialLabels = {posts:'Posts',postMedia:'Post media',createdBy:'Created by',like:'Like',unlike:'Unlike',bookmark:'Save',removeBookmark:'Remove save',comments:'Comments',share:'Share',interactionError:'Action failed'} as SocialLabels
const refs=['avatar','cover','portrait','full_body','supporting_1'].map((role,index)=>({id:`33333333-3333-4333-8333-33333333333${index}`,role}))
const ip = {id:'11111111-1111-4111-8111-111111111111',username:'luma',displayName:'Luma',shortDescription:'Moon notes',languageCodes:['en'],contentThemes:[],visualType:'anime',status:'public',operationEnabled:false,creator:{id:'77777777-7777-4777-8777-777777777777',username:'rui',displayName:'Rui'},references:refs,createdAt:'2026-09-01T00:00:00.000Z'}
const author = {kind:'ip',id:ip.id,username:ip.username,displayName:ip.displayName,bio:ip.shortDescription,languages:['en'],visualType:'anime',followerCount:0}
const post = {id:'22222222-2222-4222-8222-222222222222',body:'A real liked post',languageCode:'en',publishedAt:'2026-09-01T00:00:00.000Z',author,likeCount:1,commentCount:0}

afterEach(() => vi.unstubAllGlobals())

describe('MyProfileTabs', () => {
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

  it('keeps Following honestly unavailable without probing an unsupported owner-scoped route', async () => {
    const request=vi.fn().mockResolvedValue(Response.json({items:[],nextCursor:null}))
    vi.stubGlobal('fetch',request)
    render(<MyProfileTabs labels={labels} locale="en" socialLabels={socialLabels}/>)

    await screen.findByRole('heading',{name:'No IPs yet'})
    fireEvent.click(screen.getByRole('tab',{name:'Following'}))

    expect(await screen.findByText('Unable to load this section.')).toBeVisible()
    expect(request).not.toHaveBeenCalledWith('/api/social/following',expect.anything())
    expect(screen.queryByRole('button',{name:'Try again'})).not.toBeInTheDocument()
  })
})
