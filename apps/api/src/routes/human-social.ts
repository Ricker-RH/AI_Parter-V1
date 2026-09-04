import {HumanProfileSchema, HumanPreferencesUpdateInputSchema, HumanVisibilitySchema} from '@aifans/contracts'
import type {Actor} from '@aifans/db'
import type {Context, Hono} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ProfilePort} from '../ports/profiles.js'
import type {HumanSocialPort} from '../ports/human-social.js'
import {strictJsonBody, strictQuery} from './strict-input.js'

type ApiContext = Context<{Variables: ApiVariables}>
type Dependencies = {auth?: AuthVerifier; profiles?: ProfilePort; humanSocial?: HumanSocialPort}
const empty = z.strictObject({})
const uuid = z.uuid()
const changed = z.strictObject({changed: z.boolean()})
const preferences = z.strictObject({visibility: HumanVisibilitySchema, showPresence: z.boolean()})
const invalid = (c: ApiContext) => apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
const unavailable = (c: ApiContext) => apiError(c, 503, 'HUMAN_SOCIAL_NOT_CONFIGURED', 'Human social is not configured')
const notFound = (c: ApiContext) => apiError(c, 404, 'HUMAN_PROFILE_NOT_FOUND', 'Human profile was not found')
function failure(c: ApiContext, error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  if (code === 'PDM01') return apiError(c, 403, 'HUMAN_SOCIAL_BLOCKED', 'Relationship is unavailable because of a block')
  if (code === '42501' || code === 'P0002') return notFound(c)
  if (code === '22023') return apiError(c, 422, 'HUMAN_SOCIAL_INVALID_OPERATION', 'Human social operation is invalid')
  return apiError(c, 500, 'INTERNAL_ERROR', 'Internal server error')
}
async function resolveActor(c: ApiContext, dependencies: Dependencies, required: boolean): Promise<Actor | null | Response> {
  if (!dependencies.auth) return required || c.req.header('authorization') !== undefined ? unavailable(c) : null
  const result = await dependencies.auth.verify(c.req.raw)
  if (result.status === 'invalid' || (required && result.status === 'missing')) return apiError(c, 401, 'UNAUTHORIZED', 'Authentication is required')
  if (result.status === 'missing') return null
  const actor = {subject: result.identity.subject}
  if (required) {
    if (!dependencies.profiles) return unavailable(c)
    const account = await dependencies.profiles.getCurrentAccount(actor)
    if (!account || account.kind !== 'human') return apiError(c, 403, 'HUMAN_ACCOUNT_REQUIRED', 'A human account is required')
  }
  return actor
}
export function registerHumanSocialRoutes(app: Hono<{Variables: ApiVariables}>, dependencies: Dependencies) {
  app.get('/v1/human-preferences',async c=>{
    try{
      const actor=await resolveActor(c,dependencies,true)
      if(actor instanceof Response)return actor
      if(!strictQuery(c,empty))return invalid(c)
      if(!dependencies.humanSocial)return unavailable(c)
      return c.json(preferences.parse(await dependencies.humanSocial.getPreferences(actor!)))
    }catch(error){return failure(c,error)}
  })
  app.get('/v1/humans/:profileId', async c => {
    try {
      const viewer = await resolveActor(c, dependencies, false)
      if (viewer instanceof Response) return viewer
      const id = uuid.safeParse(c.req.param('profileId'))
      if (!id.success || !strictQuery(c, empty)) return invalid(c)
      if (!dependencies.humanSocial) return unavailable(c)
      const profile = await dependencies.humanSocial.getPublicProfile({viewer, profileId: id.data})
      return profile ? c.json(HumanProfileSchema.parse(profile)) : notFound(c)
    } catch (error) {return failure(c, error)}
  })
  app.patch('/v1/human-preferences', async c => {
    try {
      const actor = await resolveActor(c, dependencies, true)
      if (actor instanceof Response) return actor
      if (!strictQuery(c, empty)) return invalid(c)
      const input = await strictJsonBody(c, HumanPreferencesUpdateInputSchema)
      if (!input) return invalid(c)
      if (!dependencies.humanSocial) return unavailable(c)
      return c.json(preferences.parse(await dependencies.humanSocial.setPreferences(actor!, input)))
    } catch (error) {return failure(c, error)}
  })
  for (const [method, relation, operation] of [['put', 'follow', 'follow'], ['delete', 'follow', 'unfollow'], ['put', 'block', 'block'], ['delete', 'block', 'unblock']] as const) {
    app[method](`/v1/humans/:profileId/${relation}`, async c => {
      try {
        const actor = await resolveActor(c, dependencies, true)
        if (actor instanceof Response) return actor
        const id = uuid.safeParse(c.req.param('profileId'))
        if (!id.success || !strictQuery(c, empty) || !await strictJsonBody(c, empty)) return invalid(c)
        if (!dependencies.humanSocial) return unavailable(c)
        return c.json(changed.parse(await dependencies.humanSocial[operation](actor!, id.data)))
      } catch (error) {return failure(c, error)}
    })
  }
}
