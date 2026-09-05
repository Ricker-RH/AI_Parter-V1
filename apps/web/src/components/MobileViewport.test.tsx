import {render,act,cleanup} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {MobileViewport} from './MobileViewport'

afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
it.each(['browser','standalone'])('uses visual viewport only for an open keyboard in %s mode',mode=>{
  vi.stubGlobal('matchMedia',(query:string)=>({matches:query.includes('max-width')||mode==='standalone'}))
  vi.stubGlobal('innerHeight',812)
  const viewport=Object.assign(new EventTarget(),{height:812,offsetTop:0,scale:1})
  vi.stubGlobal('visualViewport',viewport)
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{callback(0);return 1})
  vi.stubGlobal('cancelAnimationFrame',vi.fn())
  const view=render(<><MobileViewport/><input aria-label="message"/></>)
  const value=()=>document.documentElement.style.getPropertyValue('--app-visible-height')
  expect(value()).toBe('')
  act(()=>view.getByLabelText('message').focus())
  expect(value()).toBe('')
  act(()=>{viewport.height=500;viewport.dispatchEvent(new Event('resize'))})
  expect(value()).toBe('500px')
  act(()=>{viewport.scale=2;viewport.dispatchEvent(new Event('resize'))})
  expect(value()).toBe('')
  act(()=>{viewport.scale=1;viewport.dispatchEvent(new Event('resize'))})
  expect(value()).toBe('500px')
  act(()=>view.getByLabelText('message').blur())
  expect(value()).toBe('')
  expect(document.documentElement.dataset.keyboardOpen).toBeUndefined()
  // Submission/emoji controls may blur then refocus before the keyboard closes.
  act(()=>view.getByLabelText('message').focus())
  expect(value()).toBe('500px')
  act(()=>{viewport.offsetTop=20;viewport.dispatchEvent(new Event('scroll'))})
  expect(value()).toBe('520px')
  // Dismissing the keyboard can retain focus on some mobile browsers.
  act(()=>{viewport.offsetTop=0;viewport.height=812;viewport.dispatchEvent(new Event('resize'))})
  expect(value()).toBe('')
  view.unmount()
  expect(value()).toBe('')
})
