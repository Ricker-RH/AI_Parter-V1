'use client'

import type {ComponentProps} from 'react'
import {Avatar} from './Avatar'
import {useOptionalCurrentAccount} from './CurrentAccountProvider'

type HumanAvatarProps = Omit<ComponentProps<typeof Avatar>, 'avatarUrl' | 'displayName'> & {
  human: {id: string; displayName: string; avatarUrl?: string | null | undefined}
}

export function HumanAvatar({human, ...props}: HumanAvatarProps) {
  const current = useOptionalCurrentAccount()?.account
  const account = current?.kind === 'human' && current.id === human.id ? current : human
  return <Avatar {...props} avatarUrl={account.avatarUrl ?? null} displayName={account.displayName}/>
}
