import {act, render, screen} from '@testing-library/react'
import {expect, it} from 'vitest'
import type {Account} from '@aifans/contracts'
import {CurrentAccountProvider, publishAccountUpdate} from './CurrentAccountProvider'
import {HumanAvatar} from './HumanAvatar'

const human = {id: '11111111-1111-4111-8111-111111111111', displayName: 'Rui', avatarUrl: 'https://media.example/projected.webp'}
const account: Account = {...human, kind: 'human', username: 'rui', avatarUrl: 'https://media.example/current.webp', preferredLocale: 'en', creatorModeEnabled: false, profileVersion: 1, background: {type: 'color', colorKey: 'paper'}}

it('renders a projected HUMAN avatar without an account provider', () => {
  render(<HumanAvatar human={human} size="small"/>)
  expect(screen.getByRole('img', {name: 'Rui'})).toHaveAttribute('src', human.avatarUrl)
})

it('updates matching historical HUMAN avatars live, including removal', () => {
  const {container} = render(<CurrentAccountProvider initialAccount={account}><HumanAvatar human={human} size="small"/></CurrentAccountProvider>)
  expect(screen.getByRole('img', {name: 'Rui'})).toHaveAttribute('src', account.avatarUrl)
  act(() => publishAccountUpdate({...account, avatarUrl: 'https://media.example/new.webp', profileVersion: 2}))
  expect(screen.getByRole('img', {name: 'Rui'})).toHaveAttribute('src', 'https://media.example/new.webp')
  act(() => publishAccountUpdate({...account, avatarUrl: null, profileVersion: 3}))
  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByRole('img', {name: 'Rui'})).toHaveTextContent('R')
})

it('never substitutes the signed-in avatar for another HUMAN', () => {
  render(<CurrentAccountProvider initialAccount={account}><HumanAvatar human={{...human, id: '22222222-2222-4222-8222-222222222222'}} size="small"/></CurrentAccountProvider>)
  expect(screen.getByRole('img', {name: 'Rui'})).toHaveAttribute('src', human.avatarUrl)
})
