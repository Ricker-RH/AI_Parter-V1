import {render,waitFor} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import en from '../../../messages/en.json'
import {CreatorAnalytics} from './CreatorAnalytics.js'

describe('CreatorAnalytics',()=>{
  it('notifies its owner when analytics loading finds a stale session',async()=>{
    const onAuthRequired=vi.fn(()=>true)
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:401})))

    render(<CreatorAnalytics ipProfileId="11111111-1111-4111-8111-111111111111" labels={en.creator} onAuthRequired={onAuthRequired}/>)

    await waitFor(()=>expect(onAuthRequired).toHaveBeenCalledTimes(1))
  })
})
