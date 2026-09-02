'use client'

import {ChatConversationSummarySchema} from '@aifans/contracts'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useRef, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'

export type StartChatButtonLabels = {
  startChat: string
  startingChat: string
  chatStartError: string
}

export function StartChatButton({authenticated, ipProfileId, labels, locale}: {authenticated: boolean; ipProfileId: string; labels: StartChatButtonLabels; locale: Locale}) {
  const router = useRouter()
  const active = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const returnTo = `/${locale}/profiles/${ipProfileId}`

  async function start() {
    if (active.current) return
    active.current = true
    setPending(true)
    setError(false)
    try {
      const response = await fetch('/api/conversations', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ipProfileId})})
      if (response.status === 401) {
        globalThis.location.assign(authHref(locale, returnTo))
        return
      }
      if (!response.ok) throw new Error('conversation unavailable')
      const parsed = ChatConversationSummarySchema.safeParse(await response.json())
      if (!parsed.success) throw new Error('invalid conversation')
      router.push(`/${locale}/messages/${parsed.data.id}`)
    } catch {
      setError(true)
    } finally {
      active.current = false
      setPending(false)
    }
  }

  if (!authenticated) return <Link href={authHref(locale, returnTo)}>{labels.startChat}</Link>
  return <div className="profile-start-chat"><button aria-busy={pending} disabled={pending} onClick={() => void start()} type="button">{pending ? labels.startingChat : labels.startChat}</button>{error ? <span role="alert">{labels.chatStartError}</span> : null}</div>
}
