'use client'

import {useRouter} from 'next/navigation'
import {useEffect, useLayoutEffect, useRef, useState} from 'react'
import type {SocialLabels} from './types'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'

function validFollowResponse(value: unknown, method: 'PUT' | 'DELETE'): boolean {
  if (typeof value !== 'object' || value === null) return false
  const entries = Object.entries(value)
  const expected = method === 'PUT' ? 'created' : 'deleted'
  return entries.length === 1 && entries[0]?.[0] === expected && typeof entries[0][1] === 'boolean'
}

type ProfileFollowButtonProps = {profileId:string;following:boolean;labels:Pick<SocialLabels,'follow'|'followingAction'|'interactionError'>;locale:Locale;onFollowingChange?(following:boolean):void;rollbackOnUnmount?:boolean;viewerScope:string}

export function ProfileFollowButton(props: ProfileFollowButtonProps) {
  const scope = JSON.stringify([props.profileId, props.viewerScope ?? 'guest'])
  return <ScopedProfileFollowButton key={scope} {...props}/>
}

function ScopedProfileFollowButton({profileId,following,labels,locale,onFollowingChange,rollbackOnUnmount}: ProfileFollowButtonProps) {
  const router=useRouter();const [active,setActive]=useState(following);const [pending,setPending]=useState(false);const [error,setError]=useState(false)
  const previousFollowing=useRef(following)
  const mutationId=useRef(0);const mutationController=useRef<AbortController|null>(null)
  const mutationRollback=useRef<(()=>void)|null>(null)
  const rollbackOnUnmountRef=useRef(rollbackOnUnmount)
  useLayoutEffect(()=>{rollbackOnUnmountRef.current=rollbackOnUnmount},[rollbackOnUnmount])
  useEffect(()=>{
    if(previousFollowing.current===following)return
    previousFollowing.current=following
    if(following===active)return
    mutationId.current+=1;mutationController.current?.abort();mutationController.current=null;mutationRollback.current=null;setActive(following);setPending(false);setError(false)
  },[active,following])
  useEffect(()=>()=>{mutationId.current+=1;mutationController.current?.abort();mutationController.current=null;const rollback=mutationRollback.current;mutationRollback.current=null;if(rollbackOnUnmountRef.current)rollback?.()},[])
  async function mutate(){
    if(pending)return
    const requestedProfileId=profileId;const requestedActive=active;const requestId=++mutationId.current
    const next=!requestedActive;const method: 'PUT' | 'DELETE'=requestedActive?'DELETE':'PUT';const controller=new AbortController();mutationController.current=controller;mutationRollback.current=()=>onFollowingChange?.(requestedActive);setActive(next);onFollowingChange?.(next);setPending(true);setError(false)
    const isCurrent=()=>!controller.signal.aborted&&requestId===mutationId.current
    try{const response=await fetch(`/api/social/profiles/${requestedProfileId}/follow`,{method,credentials:'include',signal:controller.signal});if(!isCurrent())return;if(response.status===401){setActive(requestedActive);onFollowingChange?.(requestedActive);router.replace(authHref(locale,`${window.location.pathname}${window.location.search}`));return}const body:unknown=await response.json();if(!response.ok||!validFollowResponse(body,method))throw new Error('follow failed')}catch{if(isCurrent()){setActive(requestedActive);onFollowingChange?.(requestedActive);setError(true)}}finally{if(isCurrent()){mutationController.current=null;mutationRollback.current=null;setPending(false)}}
  }
  return <div className="profile-follow"><button aria-busy={pending} aria-pressed={active} disabled={pending} onClick={()=>void mutate()} type="button">{active?labels.followingAction:labels.follow}</button><span aria-live="polite" className="interaction-error">{error?labels.interactionError:''}</span></div>
}
