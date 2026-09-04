import {AccountSchema} from '@aifans/contracts'
import {QueryClient} from '@tanstack/react-query'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {CurrentAccountProvider, useCurrentAccount} from './account/CurrentAccountProvider.js'
import {AppQueryProvider} from './AppQueryProvider.js'

const first=AccountSchema.parse({id:'11111111-1111-4111-8111-111111111111',kind:'human',username:'first',displayName:'First',preferredLocale:'en',creatorModeEnabled:false})
const second=AccountSchema.parse({...first,id:'22222222-2222-4222-8222-222222222222',username:'second',displayName:'Second'})

function SwitchAccount(){const {update}=useCurrentAccount();return <button onClick={()=>update(second)} type="button">Switch account</button>}

describe('AppQueryProvider',()=>{
  it('purges private query data on an account change while retaining public data',async()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    client.setQueryData(['my-profile','viewer-a','en','ips',null],{private:true})
    client.setQueryData(['home-feed','viewer-a','en','for_you',null],{private:true})
    client.setQueryData(['human-chat',first.id,'inbox'],{private:true})
    client.setQueryData(['ai-chat',`${first.kind}:${first.id}`,'en','inbox',null],{private:true})
    client.setQueryData(['home-feed','public','en','for_you',null],{public:true})
    render(<CurrentAccountProvider initialAccount={first}><AppQueryProvider client={client}><SwitchAccount/></AppQueryProvider></CurrentAccountProvider>)
    fireEvent.click(screen.getByRole('button',{name:'Switch account'}))
    await waitFor(()=>expect(client.getQueryData(['my-profile','viewer-a','en','ips',null])).toBeUndefined())
    expect(client.getQueryData(['home-feed','viewer-a','en','for_you',null])).toBeUndefined()
    expect(client.getQueryData(['human-chat',first.id,'inbox'])).toBeUndefined()
    expect(client.getQueryData(['ai-chat',`${first.kind}:${first.id}`,'en','inbox',null])).toBeUndefined()
    expect(client.getQueryData(['home-feed','public','en','for_you',null])).toEqual({public:true})
  })
})
