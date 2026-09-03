import type {ReactNode} from 'react'
import styles from './MessagesWorkspace.module.css'

export function InboxWorkspaceFrame({detail, list, selected = false, listUnavailable = false}: {detail?: ReactNode; list: ReactNode; selected?: boolean; listUnavailable?: boolean}) {
  return <main className={styles.workspace} data-list-unavailable={listUnavailable || undefined} data-selected={selected ? 'true' : undefined}>{list}{detail}</main>
}
