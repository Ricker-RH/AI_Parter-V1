import type {ReactNode} from 'react'

export function AuthShell({children}: {children: ReactNode}) {
  return <div className="auth-shell" data-shell="auth">{children}</div>
}
