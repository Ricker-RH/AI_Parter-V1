import type {ReactNode} from 'react'

export function CreatorShell({children}: {children: ReactNode}) {
  return <div className="creator-shell" data-shell="creator">{children}</div>
}
