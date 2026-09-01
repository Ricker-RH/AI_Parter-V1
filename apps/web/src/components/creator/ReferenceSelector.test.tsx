import {render,waitFor} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import en from '../../../messages/en.json'
import {ReferenceSelector} from './ReferenceSelector.js'

describe('ReferenceSelector',()=>{
  it('notifies its owner when a reference preview finds a stale session',async()=>{
    const onAuthRequired=vi.fn(()=>true)
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:401})))

    render(<ReferenceSelector draftId="11111111-1111-4111-8111-111111111111" initial={[{id:'22222222-2222-4222-8222-222222222222',role:'avatar'}]} labels={en.creator} onAuthRequired={onAuthRequired} readOnly/>)

    await waitFor(()=>expect(onAuthRequired).toHaveBeenCalledTimes(1))
  })
})
