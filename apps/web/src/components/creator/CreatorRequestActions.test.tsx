import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import en from '../../../messages/en.json'
import {CreatorRequestActions} from './CreatorRequestActions.js'

describe('CreatorRequestActions',()=>{
  it('notifies its owner when a request finds a stale session',async()=>{
    const onAuthRequired=vi.fn(()=>true)
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:401})))

    render(<CreatorRequestActions ipProfileId="11111111-1111-4111-8111-111111111111" labels={en.creator} onAuthRequired={onAuthRequired} onChangeDraft={vi.fn()}/>)
    fireEvent.click(screen.getByText(en.creator.requests))
    fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'Please unpublish this identity.'}})
    fireEvent.click(screen.getByRole('button',{name:'Send request'}))

    await waitFor(()=>expect(onAuthRequired).toHaveBeenCalledTimes(1))
  })
})
