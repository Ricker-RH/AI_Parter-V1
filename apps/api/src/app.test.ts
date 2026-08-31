import {describe, expect, it} from 'vitest'
import {ApiErrorSchema} from '@aifans/contracts'
import {createApp} from './app.js'

describe('AIFANS API shell', () => {
  it('returns public health with a correlated request ID', async () => {
    const response = await createApp().request('/health')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(await response.json()).toEqual({status: 'ok', service: 'aifans-api'})
  })

  it('returns a typed not-found error with the same request ID', async () => {
    const response = await createApp().request('/does-not-exist')
    const requestId = response.headers.get('x-request-id')
    const body = ApiErrorSchema.parse(await response.json())

    expect(response.status).toBe(404)
    expect(body).toMatchObject({code: 'NOT_FOUND', requestId})
  })
})
