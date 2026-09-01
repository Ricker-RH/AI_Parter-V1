import {describe, expect, it, vi} from 'vitest'
import {createProfileRepository} from '../src/profiles.js'

const account = {
  id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
  account_kind: 'human',
  username: 'rui_2',
  display_name: 'Rui',
  preferred_locale: 'zh-CN',
  creator_mode_enabled: false,
}

describe('authenticated profile updates', () => {
  it('updates only editable fields through the actor session and returns bio', async () => {
    const statements: Array<{text: string; values?: unknown[]}> = []
    const client = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        statements.push({text, values})
        if (text.startsWith('UPDATE public.profiles')) return {rows: [], rowCount: 1}
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
      username: 'rui_2', displayName: 'Rui', bio: null, preferredLocale: 'zh-CN',
    })).resolves.toMatchObject({username: 'rui_2', displayName: 'Rui', bio: null})

    expect(withActor).toHaveBeenCalledWith({subject: 'verified-subject'}, expect.any(Function))
    const update = statements.find(({text}) => text.startsWith('UPDATE public.profiles'))
    expect(update?.text).toContain('username')
    expect(update?.text).toContain('display_name')
    expect(update?.text).toContain('bio')
    expect(update?.text).toContain('preferred_locale')
    expect(update?.text).not.toContain('creator_mode_enabled')
    expect(update?.text).not.toContain('SET auth_subject')
    expect(update?.text).not.toContain('id =')
  })
})
