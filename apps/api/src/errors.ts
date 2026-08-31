import {ApiErrorSchema} from '@aifans/contracts'
import type {Context} from 'hono'
import type {ContentfulStatusCode} from 'hono/utils/http-status'
import type {ApiVariables} from './middleware/request-id.js'

export const apiError = (
  c: Context<{Variables: ApiVariables}>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
) => {
  const body = ApiErrorSchema.parse({
    code,
    message,
    requestId: c.get('requestId'),
  })

  return c.json(body, status)
}
