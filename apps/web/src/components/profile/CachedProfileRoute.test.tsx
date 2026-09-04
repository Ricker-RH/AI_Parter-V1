import {render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {CachedProfileRoute} from './CachedProfileRoute.js'

const state=vi.hoisted(()=>({account:{id:'11111111-1111-4111-8111-111111111111',kind:'human' as const,username:'rui',displayName:'Rui'} as {id:string;kind:'human';username:string;displayName:string}|null,status:'authenticated' as 'authenticated'|'anonymous'}))
const replace=vi.hoisted(()=>vi.fn())
const labels={loading:'Loading',authRequired:'Sign in required',signIn:'Sign in',unavailable:'Unavailable',retry:'Retry',emptyBio:'',edit:'Edit',save:'Save',saving:'Saving',cancel:'Cancel',displayName:'Name',username:'Username',bio:'Bio',locale:'Language',languageEnglish:'English',languageChinese:'中文',saved:'Saved',saveError:'Error',invalidName:'Invalid',invalidUsername:'Invalid',back:'Back',search:'Search',more:'More',tabs:'Tabs',myIps:'IPs',liked:'Liked',savedTab:'Saved',following:'Following',loadingSection:'Loading',unavailableSection:'Unavailable',retrySection:'Retry',myIpsEmpty:'Empty',likedEmpty:'Empty',savedEmpty:'Empty',followingEmpty:'Empty'}

vi.mock('../account/CurrentAccountProvider.js',()=>({useCurrentAccount:()=>({account:state.account,status:state.status})}))
vi.mock('next/navigation',()=>({useRouter:()=>({replace})}))
vi.mock('./MyProfilePanel.js',()=>({MyProfilePanel:({viewerScope}:{viewerScope?:string})=><div>scope:{viewerScope}</div>}))

afterEach(()=>{state.account={id:'11111111-1111-4111-8111-111111111111',kind:'human',username:'rui',displayName:'Rui'};state.status='authenticated';replace.mockReset()})

describe('CachedProfileRoute',()=>{
  it('uses the root account snapshot as the private profile cache scope',()=>{
    render(<CachedProfileRoute labels={labels} locale="en" socialLabels={labels as never}/>)
    expect(screen.getByText('scope:human:11111111-1111-4111-8111-111111111111')).toBeVisible()
  })

  it('redirects an anonymous visitor before profile data can be requested',async()=>{
    state.account=null
    state.status='anonymous'
    render(<CachedProfileRoute labels={labels} locale="en" socialLabels={labels as never}/>)
    await waitFor(()=>expect(replace).toHaveBeenCalledWith('/en/auth/sign-in?next=%2Fen%2Fprofile'))
  })
})
