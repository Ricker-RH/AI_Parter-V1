import {describe, expect, it, vi} from 'vitest'
import {createProfileRepository} from '../src/profiles.js'
import type {QueryClient, QueryPool} from '../src/session.js'

describe('profile provisioning session', () => {
  it('enters the bounded provisioner role before reading a profile', async () => {
    const statements: string[] = []
    const client = {
      async query(text: string) {
        statements.push(text)
        if (text.includes('FROM public.profiles')) {
          return {rows: [{
            id: '245652a3-c5d8-4b60-b94d-c1556db030ff',
            auth_subject: 'verified-subject',
            account_kind: 'human',
            username: 'operator',
            display_name: 'Operator',
            preferred_locale: 'zh-CN',
            creator_mode_enabled: false,
            avatar_object_key: null,
            background_type: 'color',
            background_color_key: 'paper',
            background_object_key: null,
            background_focal_x: 0.5,
            background_focal_y: 0.5,
            profile_version: 1,
          }], rowCount: 1}
        }
        return {rows: [], rowCount: null}
      },
      release: vi.fn(),
    } as QueryClient
    const pool = {connect: async () => client} satisfies QueryPool
    const repository = createProfileRepository({
      adminPool: pool,
      withActor: async (_actor, callback) => callback(client),
    })

    await expect(repository.ensureHumanProfile({authSubject: 'verified-subject'}))
      .resolves.toMatchObject({username: 'operator'})
    expect(statements).toEqual([
      'BEGIN',
      'SET LOCAL ROLE aifans_provisioner',
      expect.stringContaining('FROM public.profiles'),
      'COMMIT',
    ])
    expect(client.release).toHaveBeenCalledOnce()
  })
})
