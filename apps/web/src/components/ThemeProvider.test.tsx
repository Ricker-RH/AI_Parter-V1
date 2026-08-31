import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

vi.mock('next-themes', () => ({
  ThemeProvider: ({children}: {children: React.ReactNode}) => children,
  useTheme: () => ({theme: 'system', resolvedTheme: 'dark', setTheme: vi.fn()}),
}))

import {ThemeControls} from './ThemeProvider.js'

describe('ThemeControls', () => {
  it('selects only the configured theme after mounting', () => {
    render(<ThemeControls dark="Dark" light="Light" system="System" />)

    expect(screen.getByRole('button', {name: 'System'})).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', {name: 'Dark'})).toHaveAttribute('aria-pressed', 'false')
  })
})
