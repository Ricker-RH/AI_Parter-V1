'use client'

import {useRouter} from 'next/navigation'
import {useTransition} from 'react'

export function UnavailableRetry({label, pendingLabel}: {label: string; pendingLabel: string}) {
  const router = useRouter()
  const [retrying, startTransition] = useTransition()
  return <button aria-busy={retrying} className="unavailable-retry" disabled={retrying} onClick={() => startTransition(() => router.refresh())} type="button">{retrying ? pendingLabel : label}</button>
}
