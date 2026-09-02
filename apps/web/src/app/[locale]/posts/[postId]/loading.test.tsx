import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import Loading from './loading.js'

vi.mock('next/navigation', () => ({usePathname: () => '/en/posts/example'}))

describe('post detail loading boundary', () => {
  it('uses the detail route skeleton', () => {
    render(<Loading />)
    expect(screen.getByRole('status', {name: 'Loading AIFANS'})).toBeVisible()
  })
})
