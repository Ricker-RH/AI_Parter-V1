'use client'

import {EmptyState} from '@aifans/ui'
import {useRouter} from 'next/navigation'
import styles from './ChannelPage.module.css'

export function ChannelState({description, retry, title}: {description?: string; retry?: string; title: string}) {
  const router = useRouter()
  return <div className={styles.state} role={retry ? 'alert' : undefined}>
    <EmptyState description={description ?? ''} title={title} />
    {retry ? <button onClick={() => router.refresh()} type="button">{retry}</button> : null}
  </div>
}
