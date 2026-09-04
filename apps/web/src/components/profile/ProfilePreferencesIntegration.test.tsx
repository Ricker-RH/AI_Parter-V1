import {AccountSchema} from '@aifans/contracts'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import messages from '../../../messages/en.json'
import {CurrentAccountProvider} from '../account/CurrentAccountProvider'
import {ProfileEditor} from './ProfileEditor'
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()})}))
afterEach(()=>vi.unstubAllGlobals())
it('saves privacy inside the existing editor independently of unsaved profile fields',async()=>{
 const account=AccountSchema.parse({id:'11111111-1111-4111-8111-111111111111',kind:'human',username:'rui',displayName:'Rui',preferredLocale:'en',creatorModeEnabled:false})
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({visibility:'private',showPresence:false})).mockResolvedValueOnce(Response.json({visibility:'public',showPresence:false}));vi.stubGlobal('fetch',fetcher)
 render(<CurrentAccountProvider initialAccount={account}><ProfileEditor labels={messages.profileEditor} locale="en" returnTo="/en/profile"/></CurrentAccountProvider>)
 fireEvent.click(await screen.findByRole('switch',{name:'Private profile'}))
 await waitFor(()=>expect(screen.getByRole('switch',{name:'Private profile'})).toHaveAttribute('aria-checked','false'))
 expect(fetcher.mock.calls.map(call=>call[0])).toEqual(['/api/human-preferences','/api/human-preferences'])
 expect(screen.getByRole('button',{name:'Save'})).toBeDisabled()
})
