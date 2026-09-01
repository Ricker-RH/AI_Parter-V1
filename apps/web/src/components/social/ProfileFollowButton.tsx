'use client'

import {useRouter} from 'next/navigation'
import {useState} from 'react'
import type {SocialLabels} from './types'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'

export function ProfileFollowButton({profileId,following,labels,locale}: {profileId:string;following:boolean;labels:Pick<SocialLabels,'follow'|'followingAction'|'interactionError'>;locale:Locale}) {
  const router=useRouter();const [active,setActive]=useState(following);const [pending,setPending]=useState(false);const [error,setError]=useState(false)
  async function mutate(){const method=active?'DELETE':'PUT';setPending(true);setError(false);try{const response=await fetch(`/api/social/profiles/${profileId}/follow`,{method,credentials:'include'});if(response.status===401){router.replace(authHref(locale,`${window.location.pathname}${window.location.search}`));return}if(!response.ok)throw new Error('follow failed');setActive(!active);router.refresh()}catch{setError(true)}finally{setPending(false)}}
  return <div className="profile-follow"><button aria-busy={pending} aria-pressed={active} disabled={pending} onClick={()=>void mutate()} type="button">{active?labels.followingAction:labels.follow}</button><span aria-live="polite" className="interaction-error">{error?labels.interactionError:''}</span></div>
}
