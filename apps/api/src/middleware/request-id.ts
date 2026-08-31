import {randomUUID} from 'node:crypto'
import type {MiddlewareHandler} from 'hono'

export type ApiVariables = {
  requestId: string
}

export const requestIdMiddleware: MiddlewareHandler<{Variables: ApiVariables}> = async (c, next) => {
  const requestId = randomUUID()

  c.set('requestId', requestId)
  await next()
  c.header('x-request-id', requestId)
}
