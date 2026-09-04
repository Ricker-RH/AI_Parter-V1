import {describe, expect, it, vi} from 'vitest'
import {createProfileRepository} from '../src/profiles.js'

const account = {
  id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
  account_kind: 'human',
  username: 'rui_2',
  display_name: 'Rui',
  preferred_locale: 'zh-CN',
  creator_mode_enabled: false,
  avatar_object_key: null,
  background_type: 'color',
  background_color_key: 'paper',
  background_object_key: null,
  background_focal_x: 0.5,
  background_focal_y: 0.5,
  profile_version: 2,
}

describe('authenticated profile updates', () => {
  it('sends editable fields and the expected version through the atomic profile command', async () => {
    const statements: Array<{text: string; values?: unknown[]}> = []
    const client = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        statements.push({text, values})
        return {rows: [{current_account: account, bio: null}], rowCount: 1}
      }),
      release: vi.fn(),
    }
    const withActor = vi.fn(async (actor: {subject: string}, callback: (value: typeof client) => Promise<unknown>) => callback(client))
    const repository = createProfileRepository({
      adminPool: {connect: vi.fn()} as never,
      withActor,
    })

    await expect(repository.updateCurrentAccount({subject: 'verified-subject'}, {
      profileVersion: 1, username: 'rui_2', displayName: 'Rui', bio: null, preferredLocale: 'zh-CN',
    })).resolves.toMatchObject({username: 'rui_2', displayName: 'Rui', bio: null, profileVersion: 2})

    expect(withActor).toHaveBeenCalledWith({subject: 'verified-subject'}, expect.any(Function))
    const update = statements.find(({text}) => text.includes('profile_update_current_account'))
    expect(update?.text).toContain('id = public.current_profile_id()')
    expect(update?.values).toEqual([
      1,
      'rui_2', true,
      'Rui', true,
      null, true,
      'zh-CN', true,
      null, false,
      null, null, null, null, null, false,
    ])
  })
})
