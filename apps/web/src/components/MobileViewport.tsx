'use client'

import {useEffect} from 'react'

/** CSS owns the normal viewport; this bridge handles the on-screen keyboard. */
export function MobileViewport() {
  useEffect(() => {
    const viewport=window.visualViewport
    if(!viewport)return
    const mobile=window.matchMedia('(max-width: 699px)')
    const root=document.documentElement
    let baseline=viewport.height
    let layoutWidth=window.innerWidth
    let frame=0
    const clear=()=>{
      root.style.removeProperty('--app-visible-height')
      delete root.dataset.keyboardOpen
    }
    const update=()=>{
      const active=document.activeElement
      const editing=active instanceof HTMLElement&&(active.matches('textarea,input:not([type=radio]):not([type=checkbox]):not([type=button]):not([type=submit]):not([type=range]):not([type=color])')||active.isContentEditable)
      if(window.innerWidth!==layoutWidth){layoutWidth=window.innerWidth;baseline=viewport.height;clear();return}
      if(!mobile.matches||viewport.scale!==1){clear();return}
      // Blur can happen before the keyboard closes. Never learn a shrunken
      // keyboard viewport as the unobscured baseline for the next input.
      if(!editing){baseline=Math.max(baseline,viewport.height);clear();return}
      if(viewport.height<baseline){
        root.style.setProperty('--app-visible-height',`${viewport.height+viewport.offsetTop}px`)
        root.dataset.keyboardOpen='true'
      }else{baseline=viewport.height;clear()}
    }
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update)}
    update()
    viewport.addEventListener('resize',schedule)
    viewport.addEventListener('scroll',schedule)
    window.addEventListener('resize',schedule)
    window.addEventListener('pageshow',schedule)
    document.addEventListener('focusin',schedule)
    document.addEventListener('focusout',schedule)
    return()=>{
      cancelAnimationFrame(frame)
      viewport.removeEventListener('resize',schedule)
      viewport.removeEventListener('scroll',schedule)
      window.removeEventListener('resize',schedule)
      window.removeEventListener('pageshow',schedule)
      document.removeEventListener('focusin',schedule)
      document.removeEventListener('focusout',schedule)
      clear()
    }
  },[])
  return null
}
