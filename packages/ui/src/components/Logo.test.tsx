import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {Logo} from './Logo.js'

describe('Logo', () => {
  it('renders an accessible AIFANS wordmark', () => {
    render(<Logo />)

    expect(screen.getByRole('img', {name: 'AIFANS'})).toBeVisible()
  })
})
