'use client'

import {useRouter} from 'next/navigation'
import {useTransition} from 'react'

export function UnavailableRetry({label, pendingLabel, beforeRetry, disabled = false}: {label: string; pendingLabel: string; beforeRetry?: (() => Promise<unknown>) | undefined; disabled?: boolean}) {
  const router = useRouter()
  const [retrying, startTransition] = useTransition()
  return <button aria-busy={retrying} className="unavailable-retry" disabled={disabled || retrying} onClick={() => startTransition(async () => {
    if (beforeRetry) {
      await beforeRetry()
      startTransition(() => router.refresh())
    } else router.refresh()
  })} type="button">{retrying ? pendingLabel : label}</button>
}
