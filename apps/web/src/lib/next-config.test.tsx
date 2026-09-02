import {afterEach, describe, expect, it, vi} from 'vitest'
import {readFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'

const environment = process.env as Record<string, string | undefined>
const originalNodeEnv = environment.NODE_ENV
const originalSecret = environment.WEB_API_RATE_LIMIT_SIGNING_SECRET
const originalDistDir = environment.AIFANS_NEXT_DIST_DIR

async function readWorkspaceTurboConfig() {
  let directory = process.cwd()

  while (true) {
    try {
      return await readFile(join(directory, 'turbo.json'), 'utf8')
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }

    const parent = dirname(directory)
    if (parent === directory) throw new Error('Unable to locate the workspace turbo.json')
    directory = parent
  }
}

afterEach(() => {
  vi.resetModules()
  if (originalNodeEnv === undefined) delete environment.NODE_ENV
  else environment.NODE_ENV = originalNodeEnv
  if (originalSecret === undefined) delete environment.WEB_API_RATE_LIMIT_SIGNING_SECRET
  else environment.WEB_API_RATE_LIMIT_SIGNING_SECRET = originalSecret
  if (originalDistDir === undefined) delete environment.AIFANS_NEXT_DIST_DIR
  else environment.AIFANS_NEXT_DIST_DIR = originalDistDir
})

describe('Web production configuration', () => {
  it('passes the private rate-limit signing secret through Turborepo builds', async () => {
    const turbo = JSON.parse(await readWorkspaceTurboConfig()) as {tasks?: {build?: {env?: string[]}}}

    expect(turbo.tasks?.build?.env).toContain('WEB_API_RATE_LIMIT_SIGNING_SECRET')
  })

  it('fails startup without a valid private rate-limit signing secret', async () => {
    environment.NODE_ENV = 'production'
    delete environment.WEB_API_RATE_LIMIT_SIGNING_SECRET
    await expect(import('../../next.config.js')).rejects.toThrow('Invalid Web rate limit environment')
  })

  it('loads when production has an API-compatible private signing secret', async () => {
    environment.NODE_ENV = 'production'
    environment.WEB_API_RATE_LIMIT_SIGNING_SECRET = 'x'.repeat(32)
    await expect(import('../../next.config.js')).resolves.toHaveProperty('default')
  })

  it('uses an isolated build directory when validation config requests one', async () => {
    environment.AIFANS_NEXT_DIST_DIR = '.next-production-e2e'

    const config = await import('../../next.config.js')

    expect(config.default).toMatchObject({distDir: '.next-production-e2e'})
  })
})
