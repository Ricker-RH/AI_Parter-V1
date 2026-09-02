import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import Loading from './loading.js'

describe('post detail loading boundary', () => {
  it('uses the detail route skeleton', () => {
    render(<Loading />)
    expect(screen.getByRole('status', {name: 'AIFANS'})).toBeVisible()
  })
})
