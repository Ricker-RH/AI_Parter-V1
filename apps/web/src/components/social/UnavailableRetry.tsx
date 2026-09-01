'use client'

import {useRouter} from 'next/navigation'
import {useState} from 'react'

export function UnavailableRetry({label, pendingLabel}: {label: string; pendingLabel: string}) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  return <button aria-busy={retrying} className="unavailable-retry" disabled={retrying} onClick={() => { setRetrying(true); router.refresh() }} type="button">{retrying ? pendingLabel : label}</button>
}
