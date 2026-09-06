'use client'

import {useRouter} from 'next/navigation'
import {useTransition} from 'react'
import {BrandLoader} from '../shell/BrandLoader'

export function UnavailableRetry({label, pendingLabel, beforeRetry, disabled = false}: {label: string; pendingLabel: string; beforeRetry?: (() => Promise<unknown>) | undefined; disabled?: boolean}) {
  const router = useRouter()
  const [retrying, startTransition] = useTransition()
  return <button aria-busy={retrying} className="unavailable-retry" disabled={disabled || retrying} onClick={() => startTransition(async () => {
    if (beforeRetry) {
      await beforeRetry()
      startTransition(() => router.refresh())
    } else router.refresh()
  })} type="button"><span style={{visibility:retrying?'hidden':undefined}}>{label}</span>{retrying ? <span className="button-loading"><BrandLoader compact label={pendingLabel}/></span> : null}</button>
}
