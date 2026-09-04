import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {HumanNotificationFollow,HumanNotificationRelationships} from './HumanNotificationFollow'
const id='11111111-1111-4111-8111-111111111111'
const relationship={profileId:id,isOwner:false,following:false,followedBy:true,blocked:false}
afterEach(()=>vi.unstubAllGlobals())
function view(){return <HumanNotificationRelationships profileIds={[id,id]} viewerScope="viewer"><HumanNotificationFollow profileId={id} locale="en"/><HumanNotificationFollow profileId={id} locale="en"/></HumanNotificationRelationships>}
it('batches duplicate visible actors once and shares verified follow-back changes',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({items:[relationship]})).mockResolvedValueOnce(Response.json({changed:true})).mockResolvedValueOnce(Response.json({items:[{...relationship,following:true}]}));vi.stubGlobal('fetch',fetcher)
 render(view());expect(await screen.findAllByRole('button',{name:'Follow back'})).toHaveLength(2)
 expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0]?.[1].body).toBe(JSON.stringify({profileIds:[id]}))
 fireEvent.click(screen.getAllByRole('button',{name:'Follow back'})[0]!)
 expect(await screen.findAllByRole('button',{name:'Following'})).toHaveLength(2)
 expect(fetcher).toHaveBeenCalledWith(`/api/humans/${id}/follow`,expect.objectContaining({method:'PUT',body:'{}'}))
});
it('does not expose a follow mutation for self or blocked profiles',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({items:[{...relationship,blocked:true}]})))
 const {rerender}=render(view());expect(await screen.findAllByRole('button',{name:'Follow back'})).toHaveLength(2)
 screen.getAllByRole('button',{name:'Follow back'}).forEach(button=>expect(button).toBeDisabled())
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({items:[{...relationship,isOwner:true}]})))
 rerender(<HumanNotificationRelationships profileIds={[id]} viewerScope="another"><HumanNotificationFollow profileId={id} locale="en"/></HumanNotificationRelationships>)
 await waitFor(()=>expect(screen.queryByRole('button')).toBeNull())
});
it('keeps actual state on failures and offers authentication after a401',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({items:[relationship]})).mockResolvedValueOnce(new Response(null,{status:503}));vi.stubGlobal('fetch',fetcher)
 render(view());fireEvent.click((await screen.findAllByRole('button',{name:'Follow back'}))[0]!)
 expect(await screen.findAllByRole('alert')).toHaveLength(2);expect(screen.queryByRole('button',{name:'Following'})).toBeNull()
 fetcher.mockResolvedValueOnce(new Response(null,{status:401}));fireEvent.click(screen.getAllByRole('button',{name:'Follow back'})[0]!)
 expect(await screen.findAllByRole('link',{name:'Sign in'})).toHaveLength(2)
});
it('cancels old viewer reads and ignores late relationships after account switch',async()=>{
 let resolve!:(response:Response)=>void
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done})).mockResolvedValue(Response.json({items:[{...relationship,following:true}]}));vi.stubGlobal('fetch',fetcher)
 const {rerender}=render(view());
 rerender(<HumanNotificationRelationships profileIds={[id]} viewerScope="new-viewer"><HumanNotificationFollow profileId={id} locale="en"/></HumanNotificationRelationships>)
 expect(await screen.findByRole('button',{name:'Following'})).toBeVisible()
 resolve(Response.json({items:[relationship]}));await waitFor(()=>expect(fetcher.mock.calls[0]?.[1].signal.aborted).toBe(true))
 expect(screen.queryByRole('button',{name:'Follow back'})).toBeNull()
});
