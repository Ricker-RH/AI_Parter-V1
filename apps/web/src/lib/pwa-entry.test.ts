import {expect,it} from 'vitest'
import config from '../../next.config'

it('redirects the installed app entry before sending an unconfigured HTML viewport',async()=>{
  expect(await config.redirects?.() ?? []).toContainEqual({source:'/',destination:'/en',permanent:false})
})
