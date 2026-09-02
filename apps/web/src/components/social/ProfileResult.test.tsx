import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {ProfileResult} from './ProfileResult.js'

describe('ProfileResult', () => {
  it('renders an honest compact identity row without an unsupported follow action', () => {
    const {container} = render(<ProfileResult
      href="/en/profiles/5b8ba43c-0a9e-43ec-87be-448a9e1ebf30"
      labels={{createdBy: 'Created by'} as never}
      profile={{
        kind: 'ip',
        id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
        username: 'luna_ip',
        displayName: 'Luna',
        bio: 'A quiet moonlit storyteller.',
        languages: ['en'],
        visualType: 'anime',
      }}
    />)
    expect(container.querySelector('.profile-result')).toBeVisible()
    expect(container.querySelector('.profile-result-avatar')).toHaveTextContent('L')
    expect(screen.getByRole('heading', {name: 'Luna'})).toBeVisible()
    expect(screen.getByText('@luna_ip')).toBeVisible()
    expect(screen.getByText('A quiet moonlit storyteller.')).toBeVisible()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
