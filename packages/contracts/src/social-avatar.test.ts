import {expect, it} from 'vitest'
import {PublicHumanSchema} from './social.js'

const human = {kind: 'human', id: '11111111-1111-4111-8111-111111111111', username: 'rui', displayName: 'Rui'}
it('accepts optional nullable HTTP human avatars and rejects unsafe URLs', () => {
  for (const avatarUrl of [undefined, null, 'https://media.example/avatar.webp', 'http://localhost/avatar.webp']) {
    expect(PublicHumanSchema.safeParse({...human, avatarUrl}).success).toBe(true)
  }
  for (const avatarUrl of ['javascript:alert(1)', '//evil.example/avatar', 'not a url']) {
    expect(PublicHumanSchema.safeParse({...human, avatarUrl}).success).toBe(false)
  }
})
