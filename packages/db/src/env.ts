import {z} from 'zod'

const postgresUrl = z.string().refine((value) => {
  try {
    const {protocol} = new URL(value)
    return protocol === 'postgres:' || protocol === 'postgresql:'
  } catch {
    return false
  }
})

export type DatabaseEnv = {
  databaseUrl: string
  adminUrl: string
}

export function readDatabaseEnv(env: Record<string, string | undefined>): DatabaseEnv {
  const databaseUrl = postgresUrl.safeParse(env.DATABASE_URL)
  if (!databaseUrl.success) {
    throw new Error('DATABASE_URL must be a valid postgres URL')
  }

  const adminUrl = env.DATABASE_ADMIN_URL ?? databaseUrl.data
  if (!postgresUrl.safeParse(adminUrl).success) {
    throw new Error('DATABASE_ADMIN_URL must be a valid postgres URL')
  }

  return {databaseUrl: databaseUrl.data, adminUrl}
}
