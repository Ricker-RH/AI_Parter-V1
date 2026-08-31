'use client'

import {useState} from 'react'
import type {SocialLabels} from './types'

type ActionLabels = Pick<SocialLabels, 'bookmark' | 'follow' | 'followingAction' | 'interactionError' | 'like' | 'removeBookmark' | 'unlike'>
type Action = 'like' | 'bookmark' | 'follow'

function validMutationResponse(value: unknown, method: 'PUT' | 'DELETE'): boolean {
  if (typeof value !== 'object' || value === null) return false
  const entries = Object.entries(value)
  const expected = method === 'PUT' ? 'created' : 'deleted'
  return entries.length === 1 && entries[0]?.[0] === expected && typeof entries[0][1] === 'boolean'
}

export function PostActions({apiBaseUrl, postId, authorId, liked, bookmarked, followsAuthor, labels}: {apiBaseUrl: string; postId: string; authorId: string; liked: boolean; bookmarked: boolean; followsAuthor: boolean; labels: ActionLabels}) {
  const [state, setState] = useState({like: liked, bookmark: bookmarked, follow: followsAuthor})
  const [pending, setPending] = useState<Action | null>(null)
  const [error, setError] = useState(false)
  const baseUrl = apiBaseUrl.replace(/\/+$/, '')

  async function mutate(action: Action) {
    const active = state[action]
    const method = active ? 'DELETE' : 'PUT'
    const path = action === 'follow' ? `/v1/profiles/${authorId}/follow` : `/v1/posts/${postId}/${action}`
    setPending(action)
    setError(false)
    try {
      const response = await fetch(`${baseUrl}${path}`, {credentials: 'include', method})
      const body: unknown = await response.json()
      if (!response.ok || !validMutationResponse(body, method)) throw new Error('mutation failed')
      setState((current) => ({...current, [action]: !active}))
    } catch {
      setError(true)
    } finally {
      setPending(null)
    }
  }

  return <div className="post-actions">
    <button aria-busy={pending === 'like'} aria-pressed={state.like} disabled={pending !== null} onClick={() => void mutate('like')} type="button">{state.like ? labels.unlike : labels.like}</button>
    <button aria-busy={pending === 'bookmark'} aria-pressed={state.bookmark} disabled={pending !== null} onClick={() => void mutate('bookmark')} type="button">{state.bookmark ? labels.removeBookmark : labels.bookmark}</button>
    <button aria-busy={pending === 'follow'} aria-pressed={state.follow} disabled={pending !== null} onClick={() => void mutate('follow')} type="button">{state.follow ? labels.followingAction : labels.follow}</button>
    {error ? <span className="interaction-error" role="status">{labels.interactionError}</span> : null}
  </div>
}
