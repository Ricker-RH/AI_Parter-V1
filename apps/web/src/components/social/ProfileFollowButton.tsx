'use client'

import {useRouter} from 'next/navigation'
import {useEffect, useRef, useState} from 'react'
import type {SocialLabels} from './types'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'

export function ProfileFollowButton({profileId,following,labels,locale,onFollowingChange}: {profileId:string;following:boolean;labels:Pick<SocialLabels,'follow'|'followingAction'|'interactionError'>;locale:Locale;onFollowingChange?(following:boolean):void}) {
  const router=useRouter();const [active,setActive]=useState(following);const [pending,setPending]=useState(false);const [error,setError]=useState(false)
  const identity=useRef({profileId,following});identity.current={profileId,following}
  const mutationId=useRef(0);const mutationController=useRef<AbortController|null>(null)
  useEffect(()=>{mutationId.current+=1;mutationController.current?.abort();mutationController.current=null;setActive(following);setPending(false);setError(false)},[profileId,following])
  useEffect(()=>()=>mutationController.current?.abort(),[])
  async function mutate(){
    const requestedProfileId=profileId;const requestedFollowing=following;const requestedActive=active;const requestId=++mutationId.current
    const controller=new AbortController();mutationController.current=controller;setPending(true);setError(false)
    const isCurrent=()=>!controller.signal.aborted&&requestId===mutationId.current&&identity.current.profileId===requestedProfileId&&identity.current.following===requestedFollowing
    try{const response=await fetch(`/api/social/profiles/${requestedProfileId}/follow`,{method:requestedActive?'DELETE':'PUT',credentials:'include',signal:controller.signal});if(!isCurrent())return;if(response.status===401){router.replace(authHref(locale,`${window.location.pathname}${window.location.search}`));return}if(!response.ok)throw new Error('follow failed');const next=!requestedActive;setActive(next);onFollowingChange?.(next);router.refresh()}catch{if(isCurrent())setError(true)}finally{if(isCurrent()){mutationController.current=null;setPending(false)}}
  }
  return <div className="profile-follow"><button aria-busy={pending} aria-pressed={active} disabled={pending} onClick={()=>void mutate()} type="button">{active?labels.followingAction:labels.follow}</button><span aria-live="polite" className="interaction-error">{error?labels.interactionError:''}</span></div>
}
