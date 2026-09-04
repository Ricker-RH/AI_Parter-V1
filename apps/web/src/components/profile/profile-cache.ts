'use client'

import {HumanProfileSchema, PublicIpProfileSchema, type HumanProfile, type PublicIpProfile} from '@aifans/contracts'

export function ipProfileCacheKey(profileId: string, viewerScope?: string) {
  return ['ip-profile-preview', viewerScope ?? 'guest', profileId] as const
}

export function humanProfileCacheKey(profileId: string, viewerScope?: string) {
  return ['human-profile-preview', viewerScope ?? 'guest', profileId] as const
}

export async function loadIpProfile(profileId: string, signal?: AbortSignal): Promise<PublicIpProfile> {
  const response = await fetch(`/api/social/profiles/${profileId}`, {credentials: 'include', ...(signal ? {signal} : {})})
  const parsed = response.ok ? PublicIpProfileSchema.safeParse(await response.json()) : null
  if (!parsed?.success || parsed.data.profile.id !== profileId) throw new Error('profile unavailable')
  return parsed.data
}

export async function loadHumanProfile(profileId: string, signal?: AbortSignal): Promise<HumanProfile> {
  const response = await fetch(`/api/humans/${profileId}`, {cache: 'no-store', credentials: 'same-origin', ...(signal ? {signal} : {})})
  if (!response.ok) throw new Error('profile unavailable')
  const next = HumanProfileSchema.parse(await response.json())
  if (next.identity.id !== profileId) throw new Error('profile unavailable')
  return next
}
