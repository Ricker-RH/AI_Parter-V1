import {AnalyticsDeliveryError, type AnalyticsCapturePort} from '../ports/analytics.js'

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type PostHogAnalyticsOptions = {
  projectKey: string
  host: string
  fetcher?: Fetcher
  timeoutMs?: number
}

type PostHogEnvironment = {
  POSTHOG_API_KEY?: string
  POSTHOG_HOST?: string
}

function captureEndpoint(host: string): string {
  const url = new URL(host)
  if (url.protocol !== 'https:') throw new Error('PostHog host must use HTTPS')
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/capture/`
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function createPostHogAnalyticsCapture({
  projectKey,
  host,
  fetcher = fetch,
  timeoutMs = 5000,
}: PostHogAnalyticsOptions): AnalyticsCapturePort {
  if (!projectKey.trim()) throw new Error('PostHog project key is required')
  const endpoint = captureEndpoint(host)

  return {
    async capture(item) {
      let response: Response
      try {
        response = await fetcher(endpoint, {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({
            api_key: projectKey,
            event: item.payload.event_name,
            timestamp: item.occurredAt,
            properties: {
              ...item.payload,
              distinct_id: item.eventId,
              $insert_id: item.eventId,
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'error',
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          throw new AnalyticsDeliveryError('transient', 'provider_timeout')
        }
        throw new AnalyticsDeliveryError('transient', 'provider_unavailable')
      }
      if (response.ok) return
      if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) {
        throw new AnalyticsDeliveryError('transient', response.status === 408 ? 'provider_timeout' : 'provider_unavailable')
      }
      throw new AnalyticsDeliveryError('permanent', 'provider_rejected')
    },
  }
}

export function postHogAnalyticsCaptureFromEnv(environment: PostHogEnvironment = process.env): AnalyticsCapturePort | undefined {
  const projectKey = environment.POSTHOG_API_KEY?.trim()
  const host = environment.POSTHOG_HOST?.trim()
  if (!projectKey || !host) return undefined
  try {
    return createPostHogAnalyticsCapture({projectKey, host})
  } catch {
    return undefined
  }
}
