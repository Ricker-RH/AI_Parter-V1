import {fetchAifansApi} from './server-api'

export type OperatorPageAccess = 'operator' | 'anonymous' | 'forbidden' | 'unavailable'

export async function getOperatorPageAccess(
  fetcher: (path: string) => Promise<Response> = (path) => fetchAifansApi(path, {policy: 'private-cache'}),
): Promise<OperatorPageAccess> {
  try {
    const response = await fetcher('/v1/admin/access')
    if (response.status === 204) return 'operator'
    if (response.status === 401) return 'anonymous'
    if (response.status === 403) return 'forbidden'
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}
