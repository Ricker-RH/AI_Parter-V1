import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {Avatar} from './Avatar.js'

describe('Avatar', () => {
  it('renders a parsed HTTP image and falls back after an image error', () => {
    const {container} = render(<Avatar avatarUrl="https://media.example/rui.webp" className="surface-avatar" displayName="Rui" size="medium"/>)
    const image = screen.getByRole('img', {name: 'Rui'})
    expect(image).toHaveAttribute('src', 'https://media.example/rui.webp')
    expect(container.firstElementChild).toHaveClass('surface-avatar')
    expect(container.firstElementChild).toHaveAttribute('data-avatar-size', 'medium')

    fireEvent.error(image)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', {name: 'Rui'})).toHaveTextContent('R')
  })

  it('uses one complete Unicode grapheme for the fallback initial', () => {
    render(<Avatar avatarUrl={null} displayName="👩🏽‍💻 Rui" size="small"/>)
    expect(screen.getByRole('img', {name: '👩🏽‍💻 Rui'})).toHaveTextContent('👩🏽‍💻')
  })

  it('rejects a non-HTTP image source and remains accessible', () => {
    const {container} = render(<Avatar avatarUrl={'javascript:alert(1)' as never} displayName="Rui" size="large"/>)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', {name: 'Rui'})).toHaveTextContent('R')
  })

  it('removes image and fallback semantics when decorative', () => {
    const {container, rerender} = render(<Avatar avatarUrl="https://media.example/rui.webp" decorative displayName="Rui" size="medium"/>)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
    expect(screen.queryByRole('img')).toBeNull()

    rerender(<Avatar avatarUrl={null} decorative displayName="Rui" size="medium"/>)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstElementChild).not.toHaveAttribute('role')
    expect(screen.queryByRole('img')).toBeNull()
  })
})

  it('marks an IP avatar with a stable identity halo', () => {
    const {container, rerender} = render(<Avatar avatarUrl={null} displayName="Luna" identityId="ip-luna" kind="ip" size="medium"/>)
    expect(container.firstElementChild).toHaveAttribute('data-avatar-kind', 'ip')
    const halo = container.firstElementChild?.getAttribute('data-avatar-halo')
    rerender(<Avatar avatarUrl={null} displayName="Renamed Luna" identityId="ip-luna" kind="ip" size="medium"/>)
    expect(container.firstElementChild).toHaveAttribute('data-avatar-halo', halo)
  })
