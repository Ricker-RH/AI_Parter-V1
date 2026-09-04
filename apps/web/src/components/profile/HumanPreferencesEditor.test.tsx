import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'

function deferred<T>() {
 let resolve!: (value: T) => void
 const promise = new Promise<T>((done) => { resolve = done })
 return {promise, resolve}
}
import {HumanPreferencesEditor} from './HumanPreferencesEditor'
afterEach(()=>vi.unstubAllGlobals())
it('keeps privacy rows in place while preferences load, then enables their stored values',async()=>{
 const initial = deferred<Response>()
 const fetcher=vi.fn().mockImplementationOnce(() => initial.promise).mockResolvedValueOnce(Response.json({visibility:'public',showPresence:true}));vi.stubGlobal('fetch',fetcher)
 render(<HumanPreferencesEditor locale="en"/>)
 expect(screen.getAllByTestId('human-preference-row')).toHaveLength(2)
 expect(screen.getByTestId('human-preference-private-placeholder')).toBeVisible()
 expect(screen.getByTestId('human-preference-presence-placeholder')).toBeVisible()
 expect(screen.queryByRole('switch')).toBeNull()
 initial.resolve(Response.json({visibility:'private',showPresence:true}))
 const visibility=await screen.findByRole('switch',{name:'Private profile'})
 expect(visibility).toHaveAttribute('aria-checked','true')
 expect(screen.getByRole('switch',{name:'Show online status'})).toHaveAttribute('aria-checked','true')
 fireEvent.click(visibility)
 await waitFor(()=>expect(visibility).toHaveAttribute('aria-checked','false'))
 expect(fetcher).toHaveBeenNthCalledWith(2,'/api/human-preferences',expect.objectContaining({method:'PATCH',body:'{"visibility":"public"}'}))
 expect(screen.getByRole('switch',{name:'Show online status'})).toHaveAttribute('aria-checked','true')
})
it('requires explicit presence opt-in and reports failed saves without changing stored state',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({visibility:'private',showPresence:false})).mockResolvedValueOnce(Response.json({code:'UNAVAILABLE'},{status:503}));vi.stubGlobal('fetch',fetcher)
 render(<HumanPreferencesEditor locale="en"/>)
 const presence=await screen.findByRole('switch',{name:'Show online status'});expect(presence).toHaveAttribute('aria-checked','false')
 fireEvent.click(presence);await screen.findByRole('alert')
 expect(presence).toHaveAttribute('aria-checked','false')
 expect(fetcher).toHaveBeenNthCalledWith(2,'/api/human-preferences',expect.objectContaining({body:'{"showPresence":true}'}))
})
it('keeps stable preference rows and never presents guessed defaults when preferences cannot be read',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({visibility:'private'})).mockResolvedValueOnce(Response.json({visibility:'public',showPresence:false})))
 render(<HumanPreferencesEditor locale="en"/>)
 await screen.findByRole('alert');expect(screen.queryByRole('switch')).toBeNull()
 expect(screen.getAllByTestId('human-preference-row')).toHaveLength(2)
 expect(screen.getByTestId('human-preference-private-placeholder')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Try again'}));expect(await screen.findByRole('switch',{name:'Private profile'})).toHaveAttribute('aria-checked','false')
})
