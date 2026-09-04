import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll, afterEach, describe, expect, it} from 'vitest'
import {createProfileRepository} from '../src/profiles.js'
import {createActorSession} from '../src/session.js'

const adminConnectionString = process.env.DATABASE_ADMIN_URL ?? ''
const userConnectionString = process.env.DATABASE_USER_URL ?? ''
const describeIntegration = adminConnectionString && userConnectionString ? describe : describe.skip
const adminPool = new Pool({connectionString: adminConnectionString})
const userPool = new Pool({connectionString: userConnectionString, max: 1})
const actorSession = createActorSession(userPool)
const repository = createProfileRepository({
  adminPool,
  withActor: actorSession.withActor,
  publicMediaBaseUrl: 'https://media.example/assets',
})
const createdSubjects: string[] = []

function subject(): string {
  return `auth_${randomUUID()}`
}

afterEach(async () => {
  if (createdSubjects.length === 0) return
  const subjects = createdSubjects.splice(0)
  await adminPool.query(
    `DELETE FROM public.profile_asset_upload_reservations
     WHERE owner_profile_id IN (
       SELECT id FROM public.profiles WHERE auth_subject = ANY($1::text[])
     )`,
    [subjects],
  )
  await adminPool.query('DELETE FROM public.profiles WHERE auth_subject = ANY($1::text[])', [
    subjects,
  ])
})

afterAll(async () => {
  await Promise.all([adminPool.end(), userPool.end()])
})

describeIntegration('authenticated profile repository', () => {
  it('provisions a human profile idempotently and looks up the current account', async () => {
    const authSubject = subject()
    createdSubjects.push(authSubject)

    const first = await repository.ensureHumanProfile({
      authSubject,
      email: 'luna@example.com',
      displayName: null,
    })
    const second = await repository.ensureHumanProfile({
      authSubject: first.authSubject,
      email: 'changed@example.com',
      displayName: 'Changed',
    })

    expect(second.id).toBe(first.id)
    expect(first.accountKind).toBe('human')
    expect(first.username).toMatch(/^user_[a-f0-9]{25}$/)
    expect(first.displayName).toBe('luna')
    expect(first.avatarUrl).toBeNull()
    expect(first.profileVersion).toBe(1)
    expect(first.background).toEqual({type: 'color', colorKey: 'paper'})
    expect(await repository.getCurrentAccount({subject: first.authSubject})).toMatchObject({
      id: first.id,
      kind: 'human',
      profileVersion: 1,
      background: {type: 'color', colorKey: 'paper'},
    })
    expect(await repository.getCurrentAccount(null)).toBeNull()
  })

  it('uses a safe display-name fallback when an email is unavailable', async () => {
    const authSubject = subject()
    createdSubjects.push(authSubject)

    await expect(
      repository.ensureHumanProfile({authSubject, email: null, displayName: '   '}),
    ).resolves.toMatchObject({displayName: 'AIFANS User'})
  })

  it('rejects blank subjects before a scoped callback can run', async () => {
    await expect(
      actorSession.withActor({subject: ' \t '}, async () => undefined),
    ).rejects.toThrow('Actor subject must not be blank')
  })

  it('prevents scoped users from changing immutable fields or another profile', async () => {
    const firstSubject = subject()
    const secondSubject = subject()
    createdSubjects.push(firstSubject, secondSubject)
    const first = await repository.ensureHumanProfile({
      authSubject: firstSubject,
      email: null,
      displayName: 'First',
    })
    const second = await repository.ensureHumanProfile({
      authSubject: secondSubject,
      email: null,
      displayName: 'Second',
    })

    await expect(
      actorSession.withActor({subject: first.authSubject}, (client) =>
        client.query("UPDATE public.profiles SET account_kind = 'ip'"),
      ),
    ).rejects.toThrow(/permission denied/)

    await expect(
      actorSession.withActor({subject: first.authSubject}, (client) =>
        client.query(
          'UPDATE public.profiles SET display_name = $1 WHERE id = $2',
          ['Not allowed', second.id],
        ),
      ),
    ).rejects.toThrow(/permission denied/)
  })

  it('clears role and claim state before its injected connection is reused', async () => {
    const authSubject = subject()
    createdSubjects.push(authSubject)
    await repository.ensureHumanProfile({authSubject, email: null, displayName: 'State'})

    await actorSession.withActor({subject: authSubject}, async (client) => {
      const result = await client.query<{
        role: string
        claims: string | null
      }>("SELECT current_user AS role, current_setting('request.jwt.claims', true) AS claims")
      expect(result.rows[0]).toEqual({
        role: 'aifans_authenticated',
        claims: JSON.stringify({sub: authSubject}),
      })
    })

    const client = await userPool.connect()
    try {
      const result = await client.query<{
        role: string
        claims: string | null
        current_account: unknown
      }>(
        "SELECT current_user AS role, current_setting('request.jwt.claims', true) AS claims, public.current_account() AS current_account",
      )
      expect(result.rows[0]?.role).toBe('aifans_owner')
      expect(result.rows[0]?.claims ?? '').toMatch(/^\s*$/)
      expect(result.rows[0]?.current_account ?? null).toBeNull()
    } finally {
      client.release()
    }
  })

  it('reserves and confirms actor-owned avatar and background metadata with server keys', async () => {
    const firstSubject = subject()
    const secondSubject = subject()
    createdSubjects.push(firstSubject, secondSubject)
    const first = await repository.ensureHumanProfile({
      authSubject: firstSubject,
      email: null,
      displayName: 'First',
    })
    const second = await repository.ensureHumanProfile({
      authSubject: secondSubject,
      email: null,
      displayName: 'Second',
    })

    const avatar = await repository.reserveProfileAsset(
      {subject: first.authSubject},
      {role: 'avatar', contentType: 'image/jpeg', sizeBytes: 1_200, width: 512, height: 512},
    )
    const background = await repository.reserveProfileAsset(
      {subject: first.authSubject},
      {role: 'background', contentType: 'image/webp', sizeBytes: 2_400, width: 1_600, height: 900},
    )

    expect(avatar).toMatchObject({
      ownerProfileId: first.id,
      role: 'avatar',
      uploadContentType: 'image/jpeg',
      finalContentType: 'image/webp',
      sizeBytes: 1_200,
      width: 512,
      height: 512,
      verifiedAt: null,
    })
    expect(avatar.stagingObjectKey).toBe(`staging/profiles/${first.id}/avatar/${avatar.id}.jpg`)
    expect(avatar.finalObjectKey).toBe(`public/profiles/${first.id}/avatar/${avatar.id}.webp`)
    expect(background.stagingObjectKey).toBe(
      `staging/profiles/${first.id}/background/${background.id}.webp`,
    )
    expect(background.finalObjectKey).toBe(
      `public/profiles/${first.id}/background/${background.id}.webp`,
    )
    await expect(
      repository.getProfileAssetReservation({subject: second.authSubject}, avatar.id),
    ).resolves.toBeNull()
    await expect(
      repository.confirmProfileAsset({subject: second.authSubject}, avatar.id, avatar.finalObjectKey),
    ).resolves.toBeNull()
    await expect(
      repository.confirmProfileAsset({subject: first.authSubject}, avatar.id, background.finalObjectKey),
    ).resolves.toBeNull()

    const confirmed = await repository.confirmProfileAsset(
      {subject: first.authSubject},
      avatar.id,
      avatar.finalObjectKey,
    )
    expect(confirmed).toMatchObject({id: avatar.id, role: 'avatar'})
    expect(confirmed?.verifiedAt).toBeTruthy()
    await expect(
      repository.getProfileAssetReservation({subject: first.authSubject}, avatar.id),
    ).resolves.toMatchObject({
      id: avatar.id,
      stagingObjectKey: avatar.stagingObjectKey,
      finalObjectKey: avatar.finalObjectKey,
      finalContentType: 'image/webp',
    })
  })

  it('atomically binds verified visual assets and increments the profile version exactly once', async () => {
    const authSubject = subject()
    createdSubjects.push(authSubject)
    const account = await repository.ensureHumanProfile({
      authSubject,
      email: null,
      displayName: 'Visual',
    })
    const avatar = await repository.reserveProfileAsset(
      {subject: authSubject},
      {role: 'avatar', contentType: 'image/png', sizeBytes: 1_200, width: 512, height: 512},
    )
    const background = await repository.reserveProfileAsset(
      {subject: authSubject},
      {role: 'background', contentType: 'image/webp', sizeBytes: 2_400, width: 1_600, height: 900},
    )
    await repository.confirmProfileAsset({subject: authSubject}, avatar.id, avatar.finalObjectKey)
    await repository.confirmProfileAsset({subject: authSubject}, background.id, background.finalObjectKey)

    const updated = await repository.updateCurrentAccount({subject: authSubject}, {
      profileVersion: account.profileVersion,
      displayName: 'Updated visual',
      avatarAssetId: avatar.id,
      background: {
        type: 'image',
        backgroundAssetId: background.id,
        focalX: 0.25,
        focalY: 0.75,
      },
    })
    expect(updated).toMatchObject({
      displayName: 'Updated visual',
      profileVersion: 2,
      avatarUrl: `https://media.example/assets/${avatar.finalObjectKey}`,
      background: {
        type: 'image',
        url: `https://media.example/assets/${background.finalObjectKey}`,
        focalX: 0.25,
        focalY: 0.75,
      },
    })
    await expect(
      repository.updateCurrentAccount({subject: authSubject}, {
        profileVersion: account.profileVersion,
        displayName: 'Stale',
      }),
    ).rejects.toMatchObject({code: 'PROFILE_VERSION_CONFLICT'})

    const persisted = await adminPool.query<{
      avatar_object_key: string | null
      background_object_key: string | null
      profile_version: string
    }>(
      `SELECT avatar_object_key, background_object_key, profile_version
       FROM public.profiles WHERE id = $1`,
      [account.id],
    )
    expect(persisted.rows[0]).toEqual({
      avatar_object_key: avatar.finalObjectKey,
      background_object_key: background.finalObjectKey,
      profile_version: '2',
    })
    await expect(
      adminPool.query<{count: string}>(
        `SELECT count(*) FROM public.profile_asset_upload_reservations
         WHERE id = ANY($1::uuid[]) AND consumed_at IS NOT NULL`,
        [[avatar.id, background.id]],
      ),
    ).resolves.toMatchObject({rows: [{count: '2'}]})

    await expect(repository.updateCurrentAccount({subject: authSubject}, {
      profileVersion: updated!.profileVersion,
      avatarAssetId: null,
      background: {type: 'color', colorKey: 'sage'},
    })).resolves.toMatchObject({
      avatarUrl: null,
      profileVersion: 3,
      background: {type: 'color', colorKey: 'sage'},
    })
    await expect(
      adminPool.query(
        `SELECT 1 FROM public.profiles
         WHERE id = $1 AND avatar_object_key IS NULL AND background_object_key IS NULL`,
        [account.id],
      ),
    ).resolves.toMatchObject({rowCount: 1})
  })

  it('returns the newly committed bio from a versioned update', async () => {
    const authSubject = subject()
    createdSubjects.push(authSubject)
    const initial = await repository.ensureHumanProfile({
      authSubject,
      displayName: 'Biography',
    })
    const withOldBio = await repository.updateCurrentAccount({subject: authSubject}, {
      profileVersion: initial.profileVersion,
      bio: 'Old biography',
    })

    const updated = await repository.updateCurrentAccount({subject: authSubject}, {
      profileVersion: withOldBio!.profileVersion,
      bio: 'New biography',
    })

    expect(updated?.bio).toBe('New biography')
    await expect(repository.getCurrentAccount({subject: authSubject})).resolves.toMatchObject({
      bio: 'New biography',
    })
    await expect(
      adminPool.query<{bio: string | null}>('SELECT bio FROM public.profiles WHERE id = $1', [initial.id]),
    ).resolves.toMatchObject({rows: [{bio: 'New biography'}]})
  })

  it('updates focal coordinates on the bound image without consuming another asset', async () => {
    const authSubject = subject()
    createdSubjects.push(authSubject)
    const initial = await repository.ensureHumanProfile({authSubject, displayName: 'Focal'})

    await expect(repository.updateCurrentAccount({subject: authSubject}, {
      profileVersion: initial.profileVersion,
      background: {type: 'image', focalX: 0.2, focalY: 0.8},
    })).rejects.toMatchObject({code: 'PROFILE_ASSET_UNAVAILABLE'})

    const background = await repository.reserveProfileAsset(
      {subject: authSubject},
      {role: 'background', contentType: 'image/webp', sizeBytes: 2_400, width: 1_600, height: 900},
    )
    await repository.confirmProfileAsset({subject: authSubject}, background.id, background.finalObjectKey)
    const bound = await repository.updateCurrentAccount({subject: authSubject}, {
      profileVersion: initial.profileVersion,
      background: {type: 'image', backgroundAssetId: background.id, focalX: 0.5, focalY: 0.5},
    })

    const focused = await repository.updateCurrentAccount({subject: authSubject}, {
      profileVersion: bound!.profileVersion,
      background: {type: 'image', focalX: 0.2, focalY: 0.8},
    })

    expect(focused).toMatchObject({
      profileVersion: 3,
      background: {type: 'image', url: `https://media.example/assets/${background.finalObjectKey}`, focalX: 0.2, focalY: 0.8},
    })
    await expect(adminPool.query<{
      background_object_key: string | null
      consumed_count: string
    }>(
      `SELECT p.background_object_key,
              (SELECT count(*) FROM public.profile_asset_upload_reservations r
               WHERE r.owner_profile_id = p.id AND r.consumed_at IS NOT NULL) AS consumed_count
       FROM public.profiles p WHERE p.id = $1`,
      [initial.id],
    )).resolves.toMatchObject({rows: [{background_object_key: background.finalObjectKey, consumed_count: '1'}]})
  })

  it('rejects unverified, expired, consumed, wrong-role, and wrong-owner asset ids', async () => {
    const firstSubject = subject()
    const secondSubject = subject()
    createdSubjects.push(firstSubject, secondSubject)
    const first = await repository.ensureHumanProfile({authSubject: firstSubject, displayName: 'First'})
    const second = await repository.ensureHumanProfile({authSubject: secondSubject, displayName: 'Second'})
    const input = {contentType: 'image/webp' as const, sizeBytes: 1_200, width: 512, height: 512}

    const unverified = await repository.reserveProfileAsset(
      {subject: firstSubject},
      {...input, role: 'avatar'},
    )
    await expect(repository.updateCurrentAccount({subject: firstSubject}, {
      profileVersion: first.profileVersion,
      avatarAssetId: unverified.id,
    })).rejects.toMatchObject({code: 'PROFILE_ASSET_UNAVAILABLE'})

    const expired = await repository.reserveProfileAsset(
      {subject: firstSubject},
      {...input, role: 'avatar'},
    )
    await repository.confirmProfileAsset({subject: firstSubject}, expired.id, expired.finalObjectKey)
    await adminPool.query(
      `UPDATE public.profile_asset_upload_reservations
       SET created_at = clock_timestamp() - interval '11 minutes',
           expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [expired.id],
    )
    await expect(repository.updateCurrentAccount({subject: firstSubject}, {
      profileVersion: first.profileVersion,
      avatarAssetId: expired.id,
    })).rejects.toMatchObject({code: 'PROFILE_ASSET_UNAVAILABLE'})

    const wrongRole = await repository.reserveProfileAsset(
      {subject: firstSubject},
      {...input, role: 'background'},
    )
    await repository.confirmProfileAsset({subject: firstSubject}, wrongRole.id, wrongRole.finalObjectKey)
    await expect(repository.updateCurrentAccount({subject: firstSubject}, {
      profileVersion: first.profileVersion,
      avatarAssetId: wrongRole.id,
    })).rejects.toMatchObject({code: 'PROFILE_ASSET_UNAVAILABLE'})

    const wrongOwner = await repository.reserveProfileAsset(
      {subject: secondSubject},
      {...input, role: 'avatar'},
    )
    await repository.confirmProfileAsset({subject: secondSubject}, wrongOwner.id, wrongOwner.finalObjectKey)
    await expect(repository.updateCurrentAccount({subject: firstSubject}, {
      profileVersion: first.profileVersion,
      avatarAssetId: wrongOwner.id,
    })).rejects.toMatchObject({code: 'PROFILE_ASSET_UNAVAILABLE'})

    const consumed = await repository.reserveProfileAsset(
      {subject: firstSubject},
      {...input, role: 'avatar'},
    )
    await repository.confirmProfileAsset({subject: firstSubject}, consumed.id, consumed.finalObjectKey)
    const bound = await repository.updateCurrentAccount({subject: firstSubject}, {
      profileVersion: first.profileVersion,
      avatarAssetId: consumed.id,
    })
    await expect(repository.updateCurrentAccount({subject: firstSubject}, {
      profileVersion: bound!.profileVersion,
      avatarAssetId: consumed.id,
    })).rejects.toMatchObject({code: 'PROFILE_ASSET_UNAVAILABLE'})
    expect(second.profileVersion).toBe(1)
  })

  it('enforces background consistency and focal bounds in the database', async () => {
    const authSubject = subject()
    createdSubjects.push(authSubject)
    const account = await repository.ensureHumanProfile({authSubject, displayName: 'Constraints'})

    await expect(
      adminPool.query(
        "UPDATE public.profiles SET background_type = 'image', background_object_key = NULL WHERE id = $1",
        [account.id],
      ),
    ).rejects.toThrow(/profiles_background_consistency_check/)
    await expect(
      adminPool.query(
        `UPDATE public.profiles SET background_type = 'image',
          background_object_key = 'public/profiles/asset.webp', background_focal_x = 1.1
         WHERE id = $1`,
        [account.id],
      ),
    ).rejects.toThrow(/profiles_background_focal_x_check/)
    await expect(
      adminPool.query("UPDATE public.profiles SET background_color_key = 'magenta' WHERE id = $1", [account.id]),
    ).rejects.toThrow(/profiles_background_color_key_check/)
  })

  it('does not grant authenticated actors raw reservation access', async () => {
    const authSubject = subject()
    createdSubjects.push(authSubject)
    await repository.ensureHumanProfile({authSubject, displayName: 'Private'})

    await expect(
      actorSession.withActor({subject: authSubject}, (client) =>
        client.query('SELECT * FROM public.profile_asset_upload_reservations'),
      ),
    ).rejects.toThrow(/permission denied/)
    await expect(
      adminPool.query<{select_allowed: boolean; update_allowed: boolean}>(
        `SELECT has_table_privilege('aifans_authenticated', 'public.profile_asset_upload_reservations', 'SELECT') AS select_allowed,
                has_table_privilege('aifans_authenticated', 'public.profile_asset_upload_reservations', 'UPDATE') AS update_allowed`,
      ),
    ).resolves.toMatchObject({rows: [{select_allowed: false, update_allowed: false}]})
  })
})
